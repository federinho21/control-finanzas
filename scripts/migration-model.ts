import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { Firestore } from 'firebase-admin/firestore'
import { amountMinor, amountText, dateInput, recordId } from '../server/repositories/finance-model'

const row = z.record(z.string(), z.unknown())
export const snapshotSchema = z.object({ rocks: z.array(row), sprints: z.array(row), tasks: z.array(row), cuotas: z.array(row), documents: z.array(row), document_chunks: z.array(row) }).strict()
const text = z.string().max(2000)
const label = z.string().min(1).max(200)
const created = z.string().datetime()
const rockSchema = z.object({ id: recordId, name: label, description: text, deadline: dateInput, status: z.enum(['active', 'completed', 'blocked']), created_at: created }).strict()
const sprintSchema = z.object({ id: recordId, name: label, start_date: dateInput, end_date: dateInput, rock_id: recordId, status: z.enum(['planned', 'in_progress', 'completed', 'on_hold']), created_at: created }).strict()
const taskSchema = z.object({ id: recordId, description: label, owner: label, deadline: dateInput, priority: z.enum(['high', 'medium', 'low']), status: z.enum(['pending', 'in_progress', 'completed', 'on_hold']), rock_id: recordId, sprint_id: recordId, monto: z.string(), tipo: z.enum(['ingreso', 'gasto', 'retiro']), created_at: created }).strict()
const cuotaSchema = z.object({ id: recordId, nombre: label, frecuencia: z.enum(['mensual', 'anual']), monto: z.string(), categoria: label, ultimo_pago: dateInput.nullable(), status: z.enum(['active', 'paused']), created_at: created }).strict()
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]))
  return value
}
export function digest(value: unknown) { return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex') }
export interface MigrationRecord { path: string; data: Record<string, unknown> }
export interface MigrationFile { path: string; text: string }
export function migrationPlan(input: unknown, uid: string) {
  recordId.parse(uid)
  const snapshot = snapshotSchema.parse(input), records: MigrationRecord[] = [], files: MigrationFile[] = []
  const add = (collection: string, id: string, data: Record<string, unknown>) => {
    const path = `users/${uid}/${collection}/${id}`
    if (records.some(row => row.path === path)) throw new Error('Duplicate source ID.')
    const value = { ...data, id, userId: uid, origin: 'legacy-migration' }
    records.push({ path, data: { ...value, migrationHash: digest(value) } })
  }
  const rocks = snapshot.rocks.map(value => rockSchema.parse(value)), sprints = snapshot.sprints.map(value => sprintSchema.parse(value))
  for (const value of rocks) add('rocks', value.id, { name: value.name, description: value.description, deadline: value.deadline, status: value.status, createdAt: value.created_at })
  for (const value of sprints) {
    if (!rocks.some(rock => rock.id === value.rock_id) || value.start_date > value.end_date) throw new Error('Invalid source period relationship.')
    add('sprints', value.id, { name: value.name, startDate: value.start_date, endDate: value.end_date, rockId: value.rock_id, status: value.status, createdAt: value.created_at })
  }
  for (const raw of snapshot.tasks) {
    const value = taskSchema.parse(raw), sprint = sprints.find(sprint => sprint.id === value.sprint_id)
    if (!sprint || sprint.rock_id !== value.rock_id || value.deadline < sprint.start_date || value.deadline > sprint.end_date) throw new Error('Invalid source movement relationship.')
    const minor = amountMinor(value.monto)
    add('payments', value.id, { description: value.description, owner: value.owner, deadline: value.deadline, priority: value.priority, status: value.status, rockId: value.rock_id, sprintId: value.sprint_id, monto: amountText(minor), amountMinor: minor, currency: 'CRC', tipo: value.tipo, createdAt: value.created_at })
  }
  for (const raw of snapshot.cuotas) {
    const value = cuotaSchema.parse(raw), minor = amountMinor(value.monto)
    add('cuotas', value.id, { nombre: value.nombre, frecuencia: value.frecuencia, monto: amountText(minor), categoria: value.categoria, ultimoPago: value.ultimo_pago, status: value.status, createdAt: value.created_at })
  }
  const documentIds = new Set<number>()
  for (const raw of snapshot.documents) {
    const value = z.object({ id: z.number().int().positive(), filename: z.string().min(1).max(180), content: z.string().min(1).max(150000), created_at: created, rock_id: recordId.nullable(), temp_id: z.string().nullable() }).strict().parse(raw)
    if (documentIds.has(value.id)) throw new Error('Duplicate document ID.')
    documentIds.add(value.id)
    if (value.rock_id && !rocks.some(rock => rock.id === value.rock_id)) throw new Error('Invalid document account.')
    const id = `legacy-${value.id}`, chunks = snapshot.document_chunks.filter(row => row.document_id === value.id)
    if (chunks.length > 150) throw new Error('Document exceeds chunk limit.')
    files.push({ path: `users/${uid}/documents/${id}/extracted.txt`, text: value.content })
    add('documents', id, { filename: value.filename, rockId: value.rock_id, status: value.rock_id && chunks.length ? 'ready' : 'archived', expiresAt: null, createdAt: value.created_at, excerpt: value.content.slice(0, 1200), chunkCount: chunks.length, originalAvailable: false, extractedHash: digest(value.content) })
    for (const rawChunk of chunks) {
      const chunk = z.object({ id: z.number().int().positive(), document_id: z.number().int().positive(), chunk_text: z.string().min(1).max(1600), embedding: z.string() }).strict().parse(rawChunk)
      const vector = z.array(z.number().finite()).length(3072).parse(JSON.parse(chunk.embedding))
      add('documentChunks', `legacy-${chunk.id}`, { documentId: id, chunkText: chunk.chunk_text, embedding: vector, status: value.rock_id ? 'ready' : 'archived', createdAt: value.created_at })
    }
  }
  if (snapshot.document_chunks.some(row => !documentIds.has(Number(row.document_id)))) throw new Error('Orphan document chunks.')
  return { uid, records, files, hash: digest({ uid, records, files }) }
}

export async function checkMigration(db: Firestore, plan: ReturnType<typeof migrationPlan>) {
  let present = 0
  for (const record of plan.records) {
    const row = await db.doc(record.path).get()
    if (row.exists && digest(row.data()) !== digest(record.data)) throw new Error(`Destination conflict: ${record.path}`)
    if (row.exists) present++
    if (record.path.includes('/payments/')) {
      const id = record.path.split('/').pop()!
      if ((await db.doc(`users/${plan.uid}/hiddenPayments/${id}`).get()).exists) throw new Error('Hidden payment ID is reserved.')
      if (!(await db.collection('payments').where('userId', '==', plan.uid).where('__name__', '==', id).limit(1).get()).empty) throw new Error('Payment ID overlaps Android source; reconcile before migration.')
    }
  }
  return { present, missing: plan.records.length - present }
}
export async function applyMigration(db: Firestore, plan: ReturnType<typeof migrationPlan>) {
  await checkMigration(db, plan)
  for (const record of plan.records) await db.runTransaction(async tx => {
    const ref = db.doc(record.path), row = await tx.get(ref)
    if (row.exists) {
      if (digest(row.data()) !== digest(record.data)) throw new Error(`Destination conflict: ${record.path}`)
      return
    }
    if (record.path.includes('/payments/')) {
      const id = record.path.split('/').pop()!
      if ((await tx.get(db.doc(`users/${plan.uid}/hiddenPayments/${id}`))).exists) throw new Error('Hidden payment ID is reserved.')
      if (!(await tx.get(db.collection('payments').where('userId', '==', plan.uid).where('__name__', '==', id).limit(1))).empty) throw new Error('Payment overlaps Android source.')
    }
    tx.create(ref, record.data)
  })
  return checkMigration(db, plan)
}
