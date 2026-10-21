import assert from 'node:assert/strict'
import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { mkdtemp, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Server } from 'node:net'
import { test } from 'node:test'
import { Firestore, Timestamp, type CollectionReference } from 'firebase-admin/firestore'
import { startFirestoreEmulator } from './firestore-emulator'
import { FinanceRepository } from '../server/repositories/finance'
import { costaRicaDate, cuotaInput, movementInput } from '../server/repositories/finance-model'

test('emulator API port stays reserved until its distinct websocket port is allocated', { timeout: 60000 }, async t => {
  const listen = Server.prototype.listen
  const listeners: Server[] = []
  t.mock.method(Server.prototype, 'listen', function (this: Server, ...args: Parameters<Server['listen']>) {
    if (listeners.length === 1) assert.equal(listeners[0]!.listening, true, 'The API reservation must stay open while allocating the websocket port.')
    listeners.push(this)
    return listen.apply(this, args)
  })
  const emulator = await startFirestoreEmulator()
  t.after(() => emulator.stop())
  assert.equal(listeners.length, 2)
})

test('missing or non-file restore metadata fails before starting an emulator', async () => {
  await assert.rejects(startFirestoreEmulator(fileURLToPath(new URL('./', import.meta.url))), /export metadata file/)
  await assert.rejects(startFirestoreEmulator(fileURLToPath(new URL(`./${randomUUID()}.overall_export_metadata`, import.meta.url))), { code: 'ENOENT' })
})

async function snapshot(db: Firestore) {
  const documents: Array<{ path: string; data: unknown }> = []
  async function visit(collection: CollectionReference) {
    for (const ref of await collection.listDocuments()) {
      const document = await ref.get()
      if (document.exists) documents.push({ path: ref.path, data: document.data() })
      for (const nested of await ref.listCollections()) await visit(nested)
    }
  }
  for (const collection of await db.listCollections()) await visit(collection)
  return documents.sort((a, b) => a.path.localeCompare(b.path))
}

test('a fresh emulator restores exact finance state, ownership and replay protection from an export', { timeout: 120000 }, async t => {
  const previous = process.env.FIRESTORE_EMULATOR_HOST
  const emulators: Awaited<ReturnType<typeof startFirestoreEmulator>>[] = []
  const clients: Firestore[] = []
  const credentials = { client_email: 'synthetic@example.invalid', private_key: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() }
  t.after(async () => {
    try {
      await Promise.all(clients.map(client => client.terminate()))
    } finally {
      try { await Promise.all(emulators.map(emulator => emulator.stop())) } finally {
        if (previous === undefined) delete process.env.FIRESTORE_EMULATOR_HOST
        else process.env.FIRESTORE_EMULATOR_HOST = previous
      }
    }
  })
  function client(host: string) {
    assert.match(host, /^127\.0\.0\.1:\d+$/)
    process.env.FIRESTORE_EMULATOR_HOST = host
    const db = new Firestore({ projectId: 'demo-control-finanzas', host, ssl: false, credentials, universeDomain: 'googleapis.com' })
    clients.push(db)
    return db
  }
  const source = await startFirestoreEmulator()
  emulators.push(source)
  const db = client(source.host), repository = new FinanceRepository(db)
  const date = costaRicaDate(), month = date.slice(0, 7)
  await db.doc('payments/source-A').set({ userId: 'restore-A', parsed: true, amount: 0.1, currency: 'CRC', timestamp: Date.now(), merchant: 'Synthetic A' })
  await db.doc('payments/hidden-A').set({ userId: 'restore-A', parsed: true, amount: 99, currency: 'CRC', timestamp: Date.now() })
  await db.doc('payments/source-B').set({ userId: 'restore-B', parsed: true, amount: 7, currency: 'CRC', timestamp: Date.now(), merchant: 'Synthetic B' })
  const input = movementInput.parse({ fecha: date, tipo: 'gasto', descripcion: 'Synthetic restore', categoria: 'Test', monto: '0.30' })
  const requestId = randomUUID(), deletedRequestId = randomUUID()
  const movement = await repository.createMovement('restore-A', input, requestId)
  const foreignMovement = await repository.createMovement('restore-B', input, requestId)
  const deleted = await repository.createMovement('restore-A', input, deletedRequestId)
  await repository.deleteMovement('restore-A', deleted.id)
  await repository.deleteMovement('restore-A', 'hidden-A')
  const cuotaValues = cuotaInput.parse({ nombre: 'Synthetic cuota', frecuencia: 'mensual', monto: '1.25', categoria: 'Test' }), cuotaRequestId = randomUUID()
  const cuota = await repository.createCuota('restore-A', cuotaValues, cuotaRequestId)
  await repository.payCuota('restore-A', cuota.id)
  const protectedId = (await repository.loadMovements('restore-A')).items.find(row => row.rockId && row.id !== foreignMovement.id)?.id
  assert.ok(protectedId)
  const purgeAt = Timestamp.fromMillis(Date.now() + 86400000)
  await db.doc('users/restore-A/documents/D-TEST').set({ userId: 'restore-A', status: 'ready', purgeAt })
  await db.doc('users/restore-A/documentChunks/chunk-test').set({ userId: 'restore-A', documentId: 'D-TEST', embedding: Array(3072).fill(0.1), chunkText: 'Synthetic metadata only', status: 'ready' })
  const before = await snapshot(db)
  assert.ok(before.some(row => row.path.startsWith('users/restore-A/internal/create-')))
  const summaries = await Promise.all(['restore-A', 'restore-B'].map(uid => repository.monthlySummary(uid, month)))
  assert.equal(summaries[0]!.gastos, 1.65)
  assert.equal(summaries[1]!.gastos, 7.3)
  const directory = await mkdtemp(join(source.directory, 'snapshot-'))
  const response = await fetch(`http://${source.host}/emulator/v1/projects/demo-control-finanzas:export`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ database: 'projects/demo-control-finanzas/databases/(default)', export_directory: directory, export_name: 'firestore_export' }),
    signal: AbortSignal.timeout(15000)
  })
  assert.equal(response.status, 200)
  const metadata = join(directory, 'firestore_export', 'firestore_export.overall_export_metadata')
  assert.ok((await stat(metadata)).size > 0)
  const later = await repository.createMovement('restore-A', input, randomUUID())
  await source.stop()
  const restored = await startFirestoreEmulator(metadata)
  emulators.push(restored)
  const recoveredDb = client(restored.host), recovered = new FinanceRepository(recoveredDb)
  assert.deepEqual(await snapshot(recoveredDb), before)
  assert.equal((await recoveredDb.doc(`users/restore-A/payments/${later.id}`).get()).exists, false)
  assert.deepEqual(await Promise.all(['restore-A', 'restore-B'].map(uid => recovered.monthlySummary(uid, month))), summaries)
  assert.deepEqual(await recovered.createMovement('restore-A', input, requestId), movement)
  await assert.rejects(recovered.createMovement('restore-A', { ...input, monto: 40 }, requestId), (error: unknown) => (error as { statusCode?: number }).statusCode === 409)
  assert.deepEqual(await recovered.createMovement('restore-B', input, requestId), foreignMovement)
  assert.deepEqual(await recovered.createCuota('restore-A', cuotaValues, cuotaRequestId), cuota)
  assert.deepEqual(await recovered.createMovement('restore-A', input, deletedRequestId), deleted)
  assert.equal((await recoveredDb.doc(`users/restore-A/payments/${deleted.id}`).get()).exists, false)
  await recovered.payCuota('restore-A', cuota.id)
  assert.deepEqual(await recovered.monthlySummary('restore-A', month), summaries[0])
  await assert.rejects(recovered.deleteMovement('restore-B', protectedId), (error: unknown) => (error as { statusCode?: number }).statusCode === 404)
  assert.equal((await recoveredDb.doc('payments/hidden-A').get()).exists, true)
  assert.deepEqual((await recoveredDb.doc('users/restore-A/documents/D-TEST').get()).data()?.purgeAt, purgeAt)
  const privateRead = await fetch(`http://${restored.host}/v1/projects/demo-control-finanzas/databases/(default)/documents/users/restore-A/payments/${movement.id}`, { signal: AbortSignal.timeout(5000) })
  assert.equal(privateRead.status, 403)
  assert.deepEqual(await snapshot(recoveredDb), before)
  t.diagnostic('Synthetic emulator export/restore only; no production backup, Auth users, Storage bytes or point-in-time recovery verified.')
})
