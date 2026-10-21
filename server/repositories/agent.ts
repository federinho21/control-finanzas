import { Timestamp, type DocumentSnapshot, type Transaction } from 'firebase-admin/firestore'
import { customAlphabet } from 'nanoid'
import { z } from 'zod'
import { FinanceRepository } from './finance'
import { amountMinor, amountText, costaRicaDate, dateInput, FinanceError, movementDraft, movementInput, recordId, statusInput } from './finance-model'
import { getFirebaseFirestore } from '../firebase/admin'

const suffix = customAlphabet('1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ', 4)
const label = z.string().trim().min(1).max(200)
export const taskDraft = z.object({ description: label, owner: label, deadline: z.string().max(10), priority: z.enum(['high', 'medium', 'low']), selected: z.boolean().optional(), monto: z.string().max(16).optional(), tipo: z.enum(['ingreso', 'gasto', 'retiro']).optional() }).strict()
export const planDraft = z.object({ rock: z.object({ name: label, description: z.string().max(2000), deadline: z.string().max(10) }).strict(), sprints: z.array(z.object({ name: label, startDate: z.string().max(10), endDate: z.string().max(10), tasks: z.array(taskDraft).max(100) }).strict()).min(1).max(12) }).strict()
export const actionSession = z.string().uuid()
export type PendingKind = 'plan' | 'tasks' | 'delete' | 'status' | 'movement'

function owner(snapshot: DocumentSnapshot, uid: string) {
  const data = snapshot.data()
  if (!data || data.userId !== uid) throw new FinanceError(404, 'Record not found.')
  return data
}
function range(start: string, end: string) {
  if (start < costaRicaDate() || end <= start) throw new FinanceError(422, 'Period Boundary Rule: future start must be before end.')
}
function taskValues(task: z.output<typeof taskDraft>, start: string, end: string) {
  const deadline = dateInput.parse(task.deadline)
  if (deadline < start || deadline > end) throw new FinanceError(422, 'Period Boundary Rule: movement deadline is outside its period.')
  const minor = amountMinor(task.monto ?? '0')
  return { description: task.description, owner: task.owner, deadline, priority: task.priority, monto: amountText(minor), amountMinor: minor, currency: 'CRC', tipo: task.tipo ?? 'gasto', status: 'pending', origin: 'plan', createdAt: new Date().toISOString() }
}

export class AgentRepository extends FinanceRepository {
  private actions(uid: string) { recordId.parse(uid); return this.firestore.collection('users').doc(uid).collection('pendingActions') }
  async getRock(uid: string, id: string) { recordId.parse(id); const data = owner(await this.collection(uid, 'rocks').doc(id).get(), uid); return { id, name: String(data.name), description: String(data.description), deadline: String(data.deadline), status: String(data.status) } }
  async getSprint(uid: string, id: string) { recordId.parse(id); const data = owner(await this.collection(uid, 'sprints').doc(id).get(), uid); return { id, name: String(data.name), rockId: String(data.rockId), startDate: String(data.startDate), endDate: String(data.endDate), status: String(data.status) } }
  async getTask(uid: string, id: string) { return this.firestore.runTransaction(async tx => (await this.movement(tx, uid, id)).task) }
  async queryRock(uid: string, id: string) { const rock = await this.getRock(uid, id); const sprints = (await this.listSprints(uid)).filter(row => row.rockId === id); const tasks = (await this.loadMovements(uid)).items.filter(row => row.rockId === id); return { ...rock, sprints, tasks } }
  async querySprint(uid: string, id: string) { const sprint = await this.getSprint(uid, id); return { ...sprint, tasks: (await this.loadMovements(uid)).items.filter(row => row.sprintId === id) } }
  async createRock(uid: string, input: unknown) {
    const data = z.object({ name: label, description: z.string().max(2000), deadline: dateInput }).strict().parse(input)
    if (data.deadline < costaRicaDate()) throw new FinanceError(422, 'Account deadline cannot be in the past.')
    const id = `R-${suffix()}`
    await this.collection(uid, 'rocks').doc(id).create({ ...data, id, userId: uid, status: 'active', createdAt: new Date().toISOString() })
    return { id }
  }
  async createSprint(uid: string, input: unknown) {
    const data = z.object({ rockId: recordId, name: label, startDate: dateInput, endDate: dateInput }).strict().parse(input)
    range(data.startDate, data.endDate)
    const id = `S-${suffix()}`
    return this.firestore.runTransaction(async tx => { owner(await tx.get(this.collection(uid, 'rocks').doc(data.rockId)), uid); tx.create(this.collection(uid, 'sprints').doc(id), { ...data, id, userId: uid, status: 'planned', createdAt: new Date().toISOString() }); return { id } })
  }
  async saveAction(uid: string, sessionId: string, id: string, kind: PendingKind, payload: unknown) {
    actionSession.parse(sessionId); actionSession.parse(id)
    if (Buffer.byteLength(JSON.stringify(payload)) > 180000) throw new FinanceError(413, 'Proposal is too large.')
    if (kind === 'plan') planDraft.parse(payload)
    if (kind === 'movement') payload = movementDraft.parse(payload)
    await this.actions(uid).doc(id).create({ userId: uid, sessionId, kind, payload, state: 'pending', version: 0, createdAt: Date.now(), expiresAt: Date.now() + 3600000, purgeAt: Timestamp.fromMillis(Date.now() + 86400000) })
  }
  actionInTransaction(tx: Transaction, uid: string, sessionId: string, id: string, kind: PendingKind) {
    actionSession.parse(sessionId); actionSession.parse(id)
    const ref = this.actions(uid).doc(id)
    return tx.get(ref).then(snapshot => {
      const data = owner(snapshot, uid)
      if (data.sessionId !== sessionId || data.kind !== kind || data.expiresAt <= Date.now() || data.state === 'canceled') throw new FinanceError(404, 'Approval is unavailable.')
      return { ref, data }
    })
  }
  async getAction(uid: string, sessionId: string, id: string, kind: PendingKind) {
    return this.firestore.runTransaction(async tx => (await this.actionInTransaction(tx, uid, sessionId, id, kind)).data)
  }
  async pendingPlan(uid: string, sessionId: string) {
    actionSession.parse(sessionId)
    const rows = await this.actions(uid).where('userId', '==', uid).where('sessionId', '==', sessionId).where('kind', '==', 'plan').where('state', '==', 'pending').orderBy('createdAt', 'desc').limit(20).get()
    const row = rows.docs.filter(row => row.data().expiresAt > Date.now()).sort((a, b) => b.data().createdAt - a.data().createdAt)[0]
    return row ? { actionId: row.id, data: row.data() } : null
  }
  async replacePlan(uid: string, sessionId: string, id: string, version: number, plan: unknown) {
    const payload = planDraft.parse(plan)
    if (Buffer.byteLength(JSON.stringify(payload)) > 180000) throw new FinanceError(413, 'Proposal is too large.')
    return this.firestore.runTransaction(async tx => { const action = await this.actionInTransaction(tx, uid, sessionId, id, 'plan'); if (action.data.state !== 'pending' || action.data.version !== version) throw new FinanceError(409, 'Proposal changed. Review again.'); tx.update(action.ref, { payload, version: version + 1 }); return payload })
  }
  async cancelAction(uid: string, sessionId: string, id: string, kind: PendingKind) {
    return this.firestore.runTransaction(async tx => { const action = await this.actionInTransaction(tx, uid, sessionId, id, kind); if (action.data.state !== 'pending') throw new FinanceError(409, 'Approval already consumed.'); tx.update(action.ref, { state: 'canceled' }); return { canceled: true } })
  }
  async approvePlan(uid: string, sessionId: string, id: string, override?: unknown, tempId?: string) {
    return this.firestore.runTransaction(async tx => {
      const action = await this.actionInTransaction(tx, uid, sessionId, id, 'plan')
      if (action.data.state === 'consumed') return action.data.result
      const plan = planDraft.parse(override ?? action.data.payload)
      const deadline = dateInput.parse(plan.rock.deadline)
      if (deadline < costaRicaDate()) throw new FinanceError(422, 'Account deadline cannot be in the past.')
      const rockId = `R-${suffix()}`, sprintIds: string[] = [], taskIds: string[] = []
      const writes: Array<{ path: string; data: Record<string, unknown> }> = []
      writes.push({ path: `users/${uid}/rocks/${rockId}`, data: { ...plan.rock, deadline, id: rockId, userId: uid, status: 'active', createdAt: new Date().toISOString() } })
      for (const sprint of plan.sprints) {
        const startDate = dateInput.parse(sprint.startDate), endDate = dateInput.parse(sprint.endDate)
        range(startDate, endDate)
        if (endDate > deadline) throw new FinanceError(422, 'Period Boundary Rule: period ends after account deadline.')
        const sprintId = `S-${suffix()}`; sprintIds.push(sprintId)
        writes.push({ path: `users/${uid}/sprints/${sprintId}`, data: { id: sprintId, userId: uid, rockId, name: sprint.name, startDate, endDate, status: 'planned', createdAt: new Date().toISOString() } })
        for (const task of sprint.tasks.filter(task => task.selected !== false)) {
          const taskId = `T-${suffix()}`; taskIds.push(taskId)
          writes.push({ path: `users/${uid}/payments/${taskId}`, data: { ...taskValues(task, startDate, endDate), id: taskId, userId: uid, rockId, sprintId } })
        }
      }
      if (writes.length > 350) throw new FinanceError(413, 'Plan is too large.')
      let document: DocumentSnapshot | undefined
      if (tempId) {
        recordId.parse(tempId)
        document = await tx.get(this.firestore.doc(`users/${uid}/documents/${tempId}`))
        const data = owner(document, uid)
        if (data.rockId || data.status !== 'ready' || data.expiresAt <= Date.now()) throw new FinanceError(409, 'Document is not provisional.')
      }
      for (const write of writes) if ((await tx.get(this.firestore.doc(write.path))).exists) throw new FinanceError(409, 'Generated ID collision. Retry.')
      for (const taskId of taskIds) if ((await tx.get(this.collection(uid, 'hiddenPayments').doc(taskId))).exists) throw new FinanceError(409, 'Generated ID is reserved. Retry.')
      for (const write of writes) tx.create(this.firestore.doc(write.path), write.data)
      if (document) tx.update(document.ref, { rockId, expiresAt: null })
      const result = { rockId, sprintIds, taskIds }
      tx.update(action.ref, { state: 'consumed', result, consumedAt: Date.now() })
      return result
    })
  }
  async approveMovement(uid: string, sessionId: string, id: string) {
    return this.firestore.runTransaction(async tx => {
      const action = await this.actionInTransaction(tx, uid, sessionId, id, 'movement')
      if (action.data.state === 'consumed') return action.data.result
      const { currency, ...draft } = movementDraft.parse(action.data.payload)
      const result = await this.createMovementInTransaction(tx, uid, movementInput.parse(draft))
      tx.update(action.ref, { state: 'consumed', result, consumedAt: Date.now() })
      return result
    })
  }
  async approveTasks(uid: string, sessionId: string, id: string, override?: unknown) {
    return this.firestore.runTransaction(async tx => {
      const action = await this.actionInTransaction(tx, uid, sessionId, id, 'tasks')
      if (action.data.state === 'consumed') return action.data.result
      const stored = z.object({ rockId: recordId, sprintId: recordId, tasks: z.array(taskDraft).max(100) }).strict().parse(action.data.payload)
      const tasks = z.array(taskDraft).max(100).parse(override ?? stored.tasks).filter(task => task.selected !== false)
      owner(await tx.get(this.collection(uid, 'rocks').doc(stored.rockId)), uid)
      const sprint = owner(await tx.get(this.collection(uid, 'sprints').doc(stored.sprintId)), uid)
      if (sprint.rockId !== stored.rockId) throw new FinanceError(422, 'Period Boundary Rule: account mismatch.')
      const values = tasks.map(task => ({ ...taskValues(task, sprint.startDate, sprint.endDate), id: `T-${suffix()}` }))
      for (const value of values) if ((await tx.get(this.collection(uid, 'payments').doc(value.id))).exists) throw new FinanceError(409, 'Generated ID collision. Retry.')
      for (const value of values) if ((await tx.get(this.collection(uid, 'hiddenPayments').doc(value.id))).exists) throw new FinanceError(409, 'Generated ID is reserved. Retry.')
      for (const value of values) tx.create(this.collection(uid, 'payments').doc(value.id), { ...value, userId: uid, rockId: stored.rockId, sprintId: stored.sprintId })
      if (values.length) tx.update(this.collection(uid, 'sprints').doc(stored.sprintId), { status: sprint.status === 'completed' ? 'in_progress' : sprint.status })
      const result = { created: values.map(value => value.id) }
      tx.update(action.ref, { state: 'consumed', result, consumedAt: Date.now() })
      return result
    })
  }
  async deleteRock(uid: string, rockId: string, approval?: { sessionId: string; actionId: string }) {
    recordId.parse(rockId)
    return this.firestore.runTransaction(async tx => {
      const action = approval ? await this.actionInTransaction(tx, uid, approval.sessionId, approval.actionId, 'delete') : null
      if (action?.data.state === 'consumed') return action.data.result
      if (action && action.data.payload.rockId !== rockId) throw new FinanceError(404, 'Approval is unavailable.')
      const ref = this.collection(uid, 'rocks').doc(rockId)
      owner(await tx.get(ref), uid)
      const tasks = await tx.get(this.collection(uid, 'payments').where('userId', '==', uid).where('rockId', '==', rockId).limit(351))
      const sprints = await tx.get(this.collection(uid, 'sprints').where('userId', '==', uid).where('rockId', '==', rockId).limit(351))
      if (tasks.size * 2 + sprints.size > 450) throw new FinanceError(413, 'Deletion exceeds atomic limit.')
      if (!action && tasks.docs.some(row => row.data().status !== 'completed')) return { deleted: false, needsConfirmation: true, reason: 'Destruction Rule: human approval is required.' }
      const settingsRef = this.collection(uid, 'internal').doc('finance')
      const settings = await tx.get(settingsRef)
      for (const row of [...tasks.docs, ...sprints.docs]) tx.delete(row.ref)
      for (const row of tasks.docs) tx.set(this.collection(uid, 'hiddenPayments').doc(row.id), { userId: uid, hiddenAt: new Date().toISOString() })
      tx.delete(ref)
      if (settings.data()?.defaultRockId === rockId) tx.delete(settingsRef)
      const result = { deleted: true, needsConfirmation: false }
      if (action) tx.update(action.ref, { state: 'consumed', result, consumedAt: Date.now() })
      return result
    })
  }
  async changeStatus(uid: string, taskId: string, status: unknown, approval?: { sessionId: string; actionId: string }) {
    const parsed = statusInput.parse({ status }).status
    return this.firestore.runTransaction(async tx => {
      const action = approval ? await this.actionInTransaction(tx, uid, approval.sessionId, approval.actionId, 'status') : null
      if (action?.data.state === 'consumed') return action.data.result
      if (action && action.data.payload.taskId !== taskId) throw new FinanceError(404, 'Approval is unavailable.')
      const record = await this.movement(tx, uid, taskId)
      if (record.imported) throw new FinanceError(422, 'Imported Android payments are read-only.')
      if (record.task.status === 'completed') throw new FinanceError(422, 'Movement is already completed.')
      const sprint = await this.sprintAfterChange(tx, uid, record.task, parsed)
      tx.update(record.ref, { status: parsed })
      if (sprint) tx.update(sprint.ref, { status: sprint.status })
      const result = { ...record.task, status: parsed }
      if (action) tx.update(action.ref, { state: 'consumed', result, consumedAt: Date.now() })
      return result
    })
  }
  async quota(uid: string, category: 'chat' | 'upload', limit: number, windowMs: number) {
    recordId.parse(uid)
    const ref = this.firestore.doc(`users/${uid}/rateLimits/${category}_${Math.floor(Date.now() / windowMs)}`)
    await this.firestore.runTransaction(async tx => { const row = await tx.get(ref); const count = row.data()?.count ?? 0; if (count >= limit) throw new FinanceError(429, 'Too many requests. Retry later.'); tx.set(ref, { userId: uid, count: count + 1, purgeAt: Timestamp.fromMillis(Date.now() + windowMs * 2) }) })
  }
}
export function getAgentRepository() { return new AgentRepository(getFirebaseFirestore()) }
