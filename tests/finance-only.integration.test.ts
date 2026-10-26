import assert from 'node:assert/strict'
import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { cert, deleteApp, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { startFirestoreEmulator } from './firestore-emulator'
import { AgentRepository } from '../server/repositories/agent'
import { movementInput, costaRicaDate } from '../server/repositories/finance-model'
import { runGraph, type RunGraphInput } from '../server/agents/graph'

test('finance-only graph reads exact owned totals, completes movements without a judge and retains pending approvals', { timeout: 60000 }, async t => {
  const previous = { project: process.env.FIREBASE_PROJECT_ID, host: process.env.FIRESTORE_EMULATOR_HOST, mode: process.env.NODE_ENV }
  const emulator = await startFirestoreEmulator()
  process.env.FIREBASE_PROJECT_ID = 'demo-control-finanzas'
  process.env.FIRESTORE_EMULATOR_HOST = emulator.host
  process.env.NODE_ENV = 'test'
  const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const app = initializeApp({ projectId: 'demo-control-finanzas', credential: cert({ projectId: 'demo-control-finanzas', clientEmail: 'synthetic@example.invalid', privateKey }) }, 'control-finanzas')
  const db = getFirestore(app)
  t.after(async () => {
    try { await db.terminate(); await deleteApp(app) } finally {
      await emulator.stop()
      for (const [key, value] of Object.entries({ FIREBASE_PROJECT_ID: previous.project, FIRESTORE_EMULATOR_HOST: previous.host, NODE_ENV: previous.mode })) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value
      }
    }
  })
  const external: string[] = []
  const fetch = globalThis.fetch
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.hostname !== '127.0.0.1') { external.push(url.hostname); throw new Error('External traffic forbidden in finance-only rehearsal') }
    return fetch(input, init)
  })
  const repository = new AgentRepository(db), uid = 'FINANCEONLY-A', sessionId = randomUUID(), date = costaRicaDate()
  const input = movementInput.parse({ fecha: date, tipo: 'gasto', descripcion: 'Synthetic paid movement', categoria: 'Test', monto: '0.30' })
  const movement = await repository.createMovement(uid, input)
  await repository.createMovement('FINANCEONLY-B', { ...input, monto: 999999 })
  const events: Array<Parameters<NonNullable<RunGraphInput['onEvent']>>[0]> = []
  const run = (message: string, action?: RunGraphInput['action']) => { events.length = 0; return runGraph({ uid, sessionId, message, action, onEvent: event => events.push(event) }) }
  const report = await run('¿Cuánto gasté este mes?')
  assert.match(report.response, /₡0\.30/)
  assert.ok(!report.response.includes('9999'))
  const categories = await run('Gastos por categoría este mes')
  assert.match(categories.response, /Test: ₡0\.30/)
  const statusId = randomUUID()
  await repository.saveAction(uid, sessionId, statusId, 'status', { taskId: movement.id })
  const completed = await run('Confirm', { type: 'update_task_status', actionId: statusId, payload: { taskId: movement.id, status: 'completed' } })
  assert.equal(completed.refreshBacklog, true)
  assert.equal(completed.judgeWarning, null)
  assert.equal((await repository.getTask(uid, movement.id)).status, 'completed')
  assert.ok(!events.some(event => event.type === 'status' && /judge/i.test(String(event.data.message))))
  const approvalId = randomUUID()
  await repository.saveAction(uid, sessionId, approvalId, 'movement', { ...input, monto: '0.20', currency: 'CRC' })
  const approved = await run('Confirm', { type: 'approve_movement', actionId: approvalId })
  assert.equal(approved.refreshBacklog, true)
  assert.equal(approved.resolvedActionId, approvalId)
  assert.equal((await repository.monthlySummary(uid, date.slice(0, 7))).gastos, 0.5)
  const replay = await run('Confirm', { type: 'approve_movement', actionId: approvalId })
  assert.equal(replay.resolvedActionId, approvalId)
  assert.equal((await repository.loadMovements(uid)).items.length, 2)
  assert.deepEqual(external, [])
})
