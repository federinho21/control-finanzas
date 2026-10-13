import { FieldPath, type DocumentSnapshot, type Firestore, type Query, type Transaction } from 'firebase-admin/firestore'
import { customAlphabet } from 'nanoid'
import { z } from 'zod'
import type { Task } from '../../shared/types/task'
import type { Cuota } from '../../shared/types/cuota'
import { getFirebaseFirestore } from '../firebase/admin'
import { amountMinor, amountText, costaRicaDate, cuotaInput, dateInput, deriveSprintStatus, FinanceError, importedPayment, monthInput, monthWindow, movementInput, recordId, summarize } from './finance-model'

const idSuffix = customAlphabet('1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ', 4)
// shortcut: reports fail above 5,000 rows rather than truncate; add pagination and aggregates before expanding history.
const maxRows = 5000
const sourceFields = ['userId', 'parsed', 'amount', 'currency', 'timestamp', 'merchant', 'counterpartyName', 'categoria', 'category', 'institution', 'direction', 'transactionType']
const taskSchema = z.object({
  id: recordId, description: z.string().max(300), owner: z.string().max(200), deadline: dateInput,
  priority: z.enum(['high', 'medium', 'low']), status: z.enum(['pending', 'in_progress', 'completed', 'on_hold']),
  rockId: recordId, sprintId: recordId, monto: z.string(), tipo: z.enum(['ingreso', 'gasto', 'retiro']), createdAt: z.string().datetime()
})
const cuotaSchema = z.object({
  id: recordId, nombre: z.string(), frecuencia: z.enum(['mensual', 'anual']), monto: z.string(), categoria: z.string(),
  ultimoPago: z.string().nullable(), status: z.enum(['active', 'paused']), createdAt: z.string()
})

function owned(snapshot: DocumentSnapshot, uid: string) {
  const data = snapshot.data()
  if (!data || data.userId !== uid) throw new FinanceError(404, 'Record not found.')
  return data
}

function checkedRows(snapshot: { size: number; docs: DocumentSnapshot[] }) {
  if (snapshot.size > maxRows) throw new FinanceError(413, 'Too many records. Narrow the requested period.')
  return snapshot.docs
}

export class FinanceRepository {
  constructor(protected firestore: Firestore) {}

  protected collection(uid: string, name: 'rocks' | 'sprints' | 'payments' | 'cuotas' | 'internal' | 'periodKeys' | 'cuotaPayments' | 'hiddenPayments') {
    recordId.parse(uid)
    return this.firestore.collection('users').doc(uid).collection(name)
  }

  private async rows(query: Query) { return checkedRows(await query.limit(maxRows + 1).get()) }

  async listRocks(uid: string) {
    const rows = await this.rows(this.collection(uid, 'rocks').where('userId', '==', uid))
    return rows.map(row => { const data = owned(row, uid); return { id: row.id, name: String(data.name), description: String(data.description), deadline: String(data.deadline), status: String(data.status), createdAt: String(data.createdAt) } })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async listSprints(uid: string) {
    const rows = await this.rows(this.collection(uid, 'sprints').where('userId', '==', uid))
    return rows.map(row => { const data = owned(row, uid); return { id: row.id, name: String(data.name), rockId: String(data.rockId), startDate: String(data.startDate), endDate: String(data.endDate), status: String(data.status), createdAt: String(data.createdAt) } })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async listCuotas(uid: string): Promise<Cuota[]> {
    const rows = await this.rows(this.collection(uid, 'cuotas').where('userId', '==', uid))
    return rows.map(row => cuotaSchema.parse({ ...owned(row, uid), id: row.id })).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async loadMovements(uid: string, month?: string) {
    if (month !== undefined) monthInput.parse(month)
    let nested: Query = this.collection(uid, 'payments').where('userId', '==', uid)
    let imported: Query = this.firestore.collection('payments').where('userId', '==', uid).select(...sourceFields)
    if (month) {
      const window = monthWindow(month)
      nested = nested.where('deadline', '>=', window.startDate).where('deadline', '<=', window.endDate).orderBy('deadline', 'desc')
      imported = imported.where('timestamp', '>=', window.startTime).where('timestamp', '<', window.endTime).orderBy('timestamp', 'desc')
    }
    const [manualRows, importedRows, hiddenRows] = await Promise.all([
      this.rows(nested), this.rows(imported), this.rows(this.collection(uid, 'hiddenPayments').where('userId', '==', uid))
    ])
    const hidden = new Set(hiddenRows.map(row => row.id))
    const items = new Map<string, Task>()
    let excluded = 0
    for (const row of importedRows) {
      if (hidden.has(row.id)) continue
      const item = importedPayment(row.id, owned(row, uid))
      if (item) items.set(row.id, item)
      else excluded++
    }
    for (const row of manualRows) {
      if (hidden.has(row.id)) continue
      const data = owned(row, uid)
      const result = taskSchema.safeParse({ ...data, id: row.id })
      if (!result.success || (data.currency !== undefined && data.currency !== 'CRC')) { excluded++; continue }
      try { amountMinor(result.data.monto) } catch { excluded++; continue }
      items.set(row.id, result.data)
    }
    if (items.size > maxRows) throw new FinanceError(413, 'Too many records. Narrow the requested period.')
    return { items: [...items.values()].sort((a, b) => b.deadline.localeCompare(a.deadline) || b.createdAt.localeCompare(a.createdAt)), excluded }
  }

  async monthlySummary(uid: string, month: string) {
    const { items, excluded } = await this.loadMovements(uid, month)
    return {
      month, currency: 'CRC', ...summarize(items), excludedMovements: excluded,
      movements: items.map(row => ({ id: row.id, description: row.description, categoria: row.owner, deadline: row.deadline, monto: row.monto, tipo: row.tipo, status: row.status }))
    }
  }

  async dashboard(uid: string) {
    const month = costaRicaDate().slice(0, 7)
    const [{ items, excluded }, cuotas] = await Promise.all([this.loadMovements(uid), this.listCuotas(uid)])
    const current = items.filter(row => row.deadline.startsWith(month))
    const categories = new Map<string, Task[]>()
    for (const row of current) {
      const category = row.owner || 'Sin categoría'
      const group = categories.get(category) ?? []
      group.push(row)
      categories.set(category, group)
    }
    const totals = summarize(items)
    return {
      month, currency: 'CRC', ...summarize(current), movementsCount: current.length,
      byCategory: [...categories].map(([category, rows]) => { const values = summarize(rows); return { category, ingresos: values.ingresos, gastos: rows.filter(row => row.tipo !== 'ingreso').reduce((sum, row) => sum + amountMinor(row.monto), 0) / 100 } }).sort((a, b) => b.gastos - a.gastos),
      totals: { ingresos: totals.ingresos, gastos: totals.gastos, retiros: totals.retiros }, excludedMovements: excluded,
      cuotas: { total: cuotas.length, activas: cuotas.filter(row => row.status === 'active').length, pendientes: cuotas.filter(row => row.status === 'active' && (row.frecuencia === 'mensual' ? row.ultimoPago?.slice(0, 7) !== month : row.ultimoPago?.slice(0, 4) !== month.slice(0, 4))).length }
    }
  }

  private async anchors(tx: Transaction, uid: string, rockId: string | undefined, startDate: string, endDate: string) {
    const settingsRef = this.collection(uid, 'internal').doc('finance')
    const settings = !rockId ? await tx.get(settingsRef) : null
    if (settings?.exists) owned(settings, uid)
    const existingRock = rockId ?? settings?.data()?.defaultRockId
    if (existingRock !== undefined) recordId.parse(existingRock)
    const accountId = existingRock ?? `R-${idSuffix()}`
    const rockRef = this.collection(uid, 'rocks').doc(accountId)
    const rock = await tx.get(rockRef)
    if (existingRock) owned(rock, uid)
    else if (rock.exists) throw new FinanceError(409, 'Generated ID collision. Retry the request.')
    const periodRef = this.collection(uid, 'periodKeys').doc(`${accountId}_${startDate}_${endDate}`)
    const period = await tx.get(periodRef)
    if (period.exists) owned(period, uid)
    const sprintId = period.exists ? recordId.parse(period.data()!.sprintId) : `S-${idSuffix()}`
    const sprintRef = this.collection(uid, 'sprints').doc(sprintId)
    const sprint = await tx.get(sprintRef)
    if (period.exists) {
      const data = owned(sprint, uid)
      if (data.rockId !== accountId || data.startDate !== startDate || data.endDate !== endDate) throw new FinanceError(422, 'Invalid period relationship.')
    } else if (sprint.exists) throw new FinanceError(409, 'Generated ID collision. Retry the request.')
    const createdAt = new Date().toISOString()
    return {
      rockId: accountId, sprintId, existing: sprint.exists,
      commit: () => {
        if (!existingRock) {
          tx.create(rockRef, { id: accountId, userId: uid, name: 'Movimientos generales', description: 'Cuenta por defecto para movimientos.', deadline: `${Math.min(Number(costaRicaDate().slice(0, 4)) + 1, 9999)}-12-31`, status: 'active', createdAt })
          tx.set(settingsRef, { userId: uid, defaultRockId: accountId }, { merge: true })
        }
        if (!period.exists) {
          tx.create(sprintRef, { id: sprintId, userId: uid, rockId: accountId, name: `Período ${startDate.slice(0, 7)}`, startDate, endDate, status: 'planned', createdAt })
          tx.create(periodRef, { userId: uid, sprintId })
        }
      }
    }
  }

  private async statusOnInsert(tx: Transaction, uid: string, anchors: { sprintId: string; existing: boolean }) {
    if (!anchors.existing) return null
    const rows = checkedRows(await tx.get(this.collection(uid, 'payments').where('userId', '==', uid).where('sprintId', '==', anchors.sprintId).limit(maxRows + 1)))
    return deriveSprintStatus([...rows.map(row => ({ status: String(owned(row, uid).status) })), { status: 'pending' }])
  }

  async createMovement(uid: string, input: z.output<typeof movementInput>) {
    const deadline = input.fecha ?? costaRicaDate()
    const window = monthWindow(deadline.slice(0, 7))
    const id = `T-${idSuffix()}`
    return this.firestore.runTransaction(async tx => {
      const anchors = await this.anchors(tx, uid, input.rockId, window.startDate, window.endDate)
      const ref = this.collection(uid, 'payments').doc(id)
      const [record, hidden] = await Promise.all([tx.get(ref), tx.get(this.collection(uid, 'hiddenPayments').doc(id))])
      if (record.exists || hidden.exists) throw new FinanceError(409, 'Generated ID collision. Retry the request.')
      const status = await this.statusOnInsert(tx, uid, anchors)
      anchors.commit()
      if (status) tx.update(this.collection(uid, 'sprints').doc(anchors.sprintId), { status })
      tx.create(ref, { id, userId: uid, ...anchorsFields(anchors), description: input.descripcion, owner: input.categoria, deadline, priority: 'medium', status: 'pending', monto: amountText(input.monto), amountMinor: input.monto, currency: 'CRC', tipo: input.tipo, origin: 'manual', createdAt: new Date().toISOString() })
      return { id }
    })
  }

  async createCuota(uid: string, input: z.output<typeof cuotaInput>) {
    const id = `U-${idSuffix()}`
    const ref = this.collection(uid, 'cuotas').doc(id)
    const reservedRef = this.collection(uid, 'internal').doc(`quota-${id}`)
    return this.firestore.runTransaction(async tx => {
      const [current, reserved] = await Promise.all([tx.get(ref), tx.get(reservedRef)])
      if (current.exists || reserved.exists) throw new FinanceError(409, 'Generated ID collision. Retry the request.')
      const createdAt = new Date().toISOString()
      tx.create(ref, { id, userId: uid, nombre: input.nombre, frecuencia: input.frecuencia, monto: amountText(input.monto), amountMinor: input.monto, categoria: input.categoria, ultimoPago: null, status: 'active', createdAt })
      tx.create(reservedRef, { userId: uid, id, createdAt })
      return { id }
    })
  }

  async deleteCuota(uid: string, id: string) {
    recordId.parse(id)
    const ref = this.collection(uid, 'cuotas').doc(id)
    return this.firestore.runTransaction(async tx => {
      owned(await tx.get(ref), uid)
      const reservedRef = this.collection(uid, 'internal').doc(`quota-${id}`)
      const reserved = await tx.get(reservedRef)
      if (reserved.exists) owned(reserved, uid)
      else tx.create(reservedRef, { userId: uid, id, createdAt: new Date().toISOString() })
      tx.delete(ref)
      return { ok: true }
    })
  }

  async payCuota(uid: string, id: string, rockId?: string): Promise<Cuota> {
    recordId.parse(id)
    const ref = this.collection(uid, 'cuotas').doc(id)
    const today = costaRicaDate(), month = today.slice(0, 7)
    const movementId = `T-${idSuffix()}`
    return this.firestore.runTransaction(async tx => {
      const cuota = cuotaSchema.parse({ ...owned(await tx.get(ref), uid), id })
      if (cuota.status !== 'active') throw new FinanceError(422, 'Cuota is paused.')
      if (rockId) { recordId.parse(rockId); owned(await tx.get(this.collection(uid, 'rocks').doc(rockId)), uid) }
      const period = cuota.frecuencia === 'mensual' ? month : today.slice(0, 4)
      const paymentRef = this.collection(uid, 'cuotaPayments').doc(`${id}_${period}`)
      const paid = await tx.get(paymentRef)
      if (paid.exists) { owned(paid, uid); return cuota }
      const window = cuota.frecuencia === 'mensual' ? monthWindow(month) : { startDate: `${period}-01-01`, endDate: `${period}-12-31` }
      const anchors = await this.anchors(tx, uid, rockId, window.startDate, window.endDate)
      const movementRef = this.collection(uid, 'payments').doc(movementId)
      const [record, hidden] = await Promise.all([tx.get(movementRef), tx.get(this.collection(uid, 'hiddenPayments').doc(movementId))])
      if (record.exists || hidden.exists) throw new FinanceError(409, 'Generated ID collision. Retry the request.')
      const minor = amountMinor(cuota.monto)
      const status = await this.statusOnInsert(tx, uid, anchors)
      anchors.commit()
      if (status) tx.update(this.collection(uid, 'sprints').doc(anchors.sprintId), { status })
      tx.create(movementRef, { id: movementId, userId: uid, ...anchorsFields(anchors), description: `${cuota.nombre} (cuota ${cuota.frecuencia})`, owner: cuota.categoria, deadline: today, priority: 'medium', status: 'pending', monto: amountText(minor), amountMinor: minor, currency: 'CRC', tipo: 'gasto', origin: 'cuota', createdAt: new Date().toISOString() })
      tx.create(paymentRef, { userId: uid, paymentId: movementId, createdAt: new Date().toISOString() })
      tx.update(ref, { ultimoPago: today })
      return { ...cuota, ultimoPago: today }
    })
  }

  protected async movement(tx: Transaction, uid: string, id: string) {
    recordId.parse(id)
    if ((await tx.get(this.collection(uid, 'hiddenPayments').doc(id))).exists) throw new FinanceError(404, 'Record not found.')
    const ref = this.collection(uid, 'payments').doc(id)
    const record = await tx.get(ref)
    if (record.exists) return { ref, task: taskSchema.parse({ ...owned(record, uid), id }), imported: false }
    const rows = await tx.get(this.firestore.collection('payments').where('userId', '==', uid).where(FieldPath.documentId(), '==', id).select(...sourceFields).limit(1))
    const source = rows.docs[0]
    if (!source) throw new FinanceError(404, 'Record not found.')
    const task = importedPayment(source.id, owned(source, uid))
    if (!task) throw new FinanceError(404, 'Record not found.')
    return { ref: source.ref, task, imported: true }
  }

  protected async sprintAfterChange(tx: Transaction, uid: string, task: Task, status?: Task['status']) {
    if (!task.sprintId) return null
    const ref = this.collection(uid, 'sprints').doc(task.sprintId)
    const sprint = owned(await tx.get(ref), uid)
    if (sprint.rockId !== task.rockId) throw new FinanceError(422, 'Invalid period relationship.')
    const rows = checkedRows(await tx.get(this.collection(uid, 'payments').where('userId', '==', uid).where('sprintId', '==', task.sprintId).limit(maxRows + 1)))
    const statuses = rows.filter(row => row.id !== task.id).map(row => ({ status: String(owned(row, uid).status) }))
    if (status) statuses.push({ status })
    return { ref, status: deriveSprintStatus(statuses) }
  }

  async updateMovementStatus(uid: string, id: string, status: Task['status']) {
    return this.firestore.runTransaction(async tx => {
      const record = await this.movement(tx, uid, id)
      if (record.task.status === 'completed') throw new FinanceError(422, 'Movement is already completed and cannot be changed.')
      const sprint = await this.sprintAfterChange(tx, uid, record.task, status)
      tx.update(record.ref, { status })
      if (sprint) tx.update(sprint.ref, { status: sprint.status })
      return { ...record.task, status, newSprintStatus: sprint?.status ?? null }
    })
  }

  async deleteMovement(uid: string, id: string) {
    return this.firestore.runTransaction(async tx => {
      const record = await this.movement(tx, uid, id)
      const sprint = await this.sprintAfterChange(tx, uid, record.task)
      const sourceRetained = record.imported || !(await tx.get(this.firestore.collection('payments').where('userId', '==', uid).where(FieldPath.documentId(), '==', id).select('userId').limit(1))).empty
      if (!record.imported) tx.delete(record.ref)
      tx.set(this.collection(uid, 'hiddenPayments').doc(id), { userId: uid, hiddenAt: new Date().toISOString() })
      if (sprint) tx.update(sprint.ref, { status: sprint.status })
      return { ok: true, sourceRetained }
    })
  }
}

function anchorsFields(anchors: { rockId: string; sprintId: string }) { return { rockId: anchors.rockId, sprintId: anchors.sprintId } }

export function getFinanceRepository() { return new FinanceRepository(getFirebaseFirestore()) }

export type FinanceCommand =
  | { type: 'create_movement'; input: z.output<typeof movementInput> }
  | { type: 'create_cuota'; input: z.output<typeof cuotaInput> }
  | { type: 'pay_cuota'; id: string; rockId?: string }
  | { type: 'delete_cuota'; id: string }
  | { type: 'update_movement'; id: string; status: Task['status'] }
  | { type: 'delete_movement'; id: string }
