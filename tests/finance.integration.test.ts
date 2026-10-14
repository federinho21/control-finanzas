import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { generateKeyPairSync } from 'node:crypto'
import { before, after, test } from 'node:test'
import { stat } from 'node:fs/promises'
import { createApp, createRouter, eventHandler, toNodeListener } from 'h3'
import { cert, deleteApp, initializeApp } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { FinanceRepository } from '../server/repositories/finance'
import { costaRicaDate, movementInput, cuotaInput } from '../server/repositories/finance-model'
import { createFinanceHandlers } from '../server/utils/finance-handlers'
import { createAuthService, type AuthProvider } from '../server/utils/auth-service'
import { createLegacyGate } from '../server/middleware/legacy-security'
import { runDataOperation, runFinanceOperation } from '../server/agents/data-agent'
import { startFirestoreEmulator } from './firestore-emulator'
import { AgentRepository } from '../server/repositories/agent'
import { DocumentRepository } from '../server/repositories/documents'
import { validateFile } from '../server/utils/pdf-parser'
import { applyMigration, checkMigration, migrationPlan } from '../scripts/migration-model'
import { createChatHandler } from '../server/api/chat.post'

let emulator: Awaited<ReturnType<typeof startFirestoreEmulator>>
let db: Firestore, repository: FinanceRepository, url: string
let server: ReturnType<typeof createServer>, app: ReturnType<typeof initializeApp>
let sqliteTime: number | undefined
const origin = 'https://finance.example'
const month = costaRicaDate().slice(0, 7)
const provider: AuthProvider = {
  async verifySessionCookie(token, revoked) {
    assert.equal(revoked, true)
    if (token !== 'A' && token !== 'B') throw new Error('Invalid cookie')
    return { uid: token, auth_time: 0, firebase: { sign_in_provider: 'google.com' } }
  },
  async verifyIdToken() { throw new Error('Not used in finance tests') },
  async createSessionCookie() { throw new Error('Not used in finance tests') },
  async revokeRefreshTokens() { throw new Error('Not used in finance tests') }
}

before(async () => {
  sqliteTime = (await stat('.data/hackathon.db').catch(() => null))?.mtimeMs
  emulator = await startFirestoreEmulator()
  process.env.FIRESTORE_EMULATOR_HOST = emulator.host
  const key = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  app = initializeApp({ projectId: 'demo-control-finanzas', credential: cert({ projectId: 'demo-control-finanzas', clientEmail: 'test@example.invalid', privateKey: key }) }, 'finance-integration-tests')
  db = getFirestore(app)
  repository = new FinanceRepository(db)
  const auth = createAuthService({ production: true, origin: () => origin, provider: async () => provider })
  const handlers = createFinanceHandlers({ user: auth.requireUser, origin: auth.requireOrigin, repository: () => repository, write: runFinanceOperation })
  const httpApp = createApp({ debug: false })
  const router = createRouter()
    .get('/api/rocks', eventHandler(handlers.rocks)).get('/api/sprints', eventHandler(handlers.sprints))
    .get('/api/tasks', eventHandler(handlers.tasks)).get('/api/cuotas', eventHandler(handlers.cuotas))
    .get('/api/dashboard', eventHandler(handlers.dashboard)).get('/api/resumen', eventHandler(handlers.resumen))
    .post('/api/movimientos', eventHandler(handlers.createMovement)).post('/api/cuotas', eventHandler(handlers.createCuota))
    .patch('/api/tasks/:id', eventHandler(handlers.updateTask)).delete('/api/tasks/:id', eventHandler(handlers.deleteTask))
    .patch('/api/cuotas/:id', eventHandler(handlers.payCuota)).delete('/api/cuotas/:id', eventHandler(handlers.deleteCuota))
    .patch('/api/sprints/:id', eventHandler(handlers.updateSprint))
  httpApp.use(createLegacyGate(auth.requireUser, auth.requireOrigin)).use(router)
  server = createServer(toNodeListener(httpApp))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  await db.collection('payments').doc('legacy-A').set({ userId: 'A', parsed: true, amount: 0.1, currency: 'CRC', timestamp: Date.now(), merchant: 'A PRIVATE MERCHANT', rawText: 'A PRIVATE RAW TEXT' })
  await db.collection('payments').doc('legacy-B').set({ userId: 'B', parsed: true, amount: 9000, currency: 'CRC', timestamp: Date.now(), merchant: 'B PRIVATE MERCHANT', rawText: 'B PRIVATE RAW TEXT' })
  await db.collection('payments').doc('USD-A').set({ userId: 'A', parsed: true, amount: 100, currency: 'USD', timestamp: Date.now() })
}, { timeout: 60000 })

after(async () => {
  if (server) {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
  if (db) await db.terminate()
  if (app) await deleteApp(app)
  await emulator?.stop()
  delete process.env.FIRESTORE_EMULATOR_HOST
  assert.equal((await stat('.data/hackathon.db').catch(() => null))?.mtimeMs, sqliteTime, 'Financial tests must not open/write SQLite')
}, { timeout: 15000 })

function request(path: string, user: string | null = 'A', options: { method?: string; body?: unknown; origin?: string } = {}) {
  return fetch(url + path, { method: options.method ?? 'GET', headers: {
    ...(user ? { cookie: `__Host-finanzas-session=${user}` } : {}),
    origin: options.origin ?? origin, ...(options.body !== undefined ? { 'content-type': 'application/json' } : {})
  }, body: options.body === undefined ? undefined : JSON.stringify(options.body) })
}

test('all thirteen finance endpoint methods reject anonymous requests before storage access', async () => {
  for (const [method, path] of [
    ['GET', '/api/rocks'], ['GET', '/api/sprints'], ['GET', '/api/tasks'], ['GET', '/api/cuotas'], ['GET', '/api/dashboard'], ['GET', `/api/resumen?mes=${month}`],
    ['POST', '/api/movimientos'], ['POST', '/api/cuotas'], ['PATCH', '/api/tasks/id'], ['DELETE', '/api/tasks/id'], ['PATCH', '/api/cuotas/id'], ['DELETE', '/api/cuotas/id'], ['PATCH', '/api/sprints/id']
  ]) assert.equal((await request(path!, null, { method })).status, 401, `${method} ${path}`)
})

test('Firestore lists and reports expose only the verified owner; raw text and USD never enter CRC totals', async () => {
  const response = await request('/api/tasks')
  const text = await response.text()
  assert.equal(response.status, 200)
  assert.ok(text.includes('A PRIVATE MERCHANT'))
  assert.ok(!text.includes('B PRIVATE'))
  assert.ok(!text.includes('RAW TEXT'))
  assert.ok(!text.includes('USD-A'))
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const summary = await (await request(`/api/resumen?mes=${month}`)).json()
  assert.equal(summary.gastos, 0.1)
  assert.equal(summary.excludedMovements, 1)
  assert.equal((await (await request('/api/dashboard', 'B')).json()).gastos, 9000)
})

test('CSRF, client UID injection, invalid amounts/months/dates and path traversal fail without writes', async () => {
  const valid = { fecha: costaRicaDate(), tipo: 'gasto', descripcion: 'Test', categoria: 'Test', monto: '0.20' }
  assert.equal((await request('/api/movimientos', 'A', { method: 'POST', body: valid, origin: 'https://attacker.example' })).status, 403)
  for (const extra of [{ userId: 'B' }, { monto: '-1' }, { monto: '1.005' }, { fecha: '2026-02-30' }, { rockId: '../B' }]) assert.equal((await request('/api/movimientos', 'A', { method: 'POST', body: { ...valid, ...extra } })).status, 400)
  assert.equal((await request('/api/tasks?mes=2026-13')).status, 400)
  assert.equal((await request('/api/tasks?userId=B')).status, 400)
  assert.equal((await db.collection('users').doc('A').collection('payments').get()).size, 0)
})

let movementId: string, rockId: string, sprintId: string, cuotaId: string
test('manual movement creates owned account/period/payment atomically with exact amount', async () => {
  const response = await request('/api/movimientos', 'A', { method: 'POST', body: { fecha: costaRicaDate(), tipo: 'gasto', descripcion: 'A movement', categoria: 'Test', monto: '0.20' } })
  assert.equal(response.status, 200, await response.clone().text())
  movementId = (await response.json()).id
  const record = (await db.doc(`users/A/payments/${movementId}`).get()).data()!
  rockId = record.rockId; sprintId = record.sprintId
  assert.equal(record.userId, 'A')
  assert.equal(record.amountMinor, 20)
  assert.equal(record.monto, '0.20')
  assert.equal((await db.doc(`users/A/rocks/${rockId}`).get()).data()!.userId, 'A')
  assert.equal((await db.doc(`users/A/sprints/${sprintId}`).get()).data()!.rockId, rockId)
  assert.equal((await (await request(`/api/resumen?mes=${month}`)).json()).gastos, 0.3)
})

test('IDOR: another user cannot update/delete movements or attach an owned movement to a foreign account', async () => {
  for (const method of ['PATCH', 'DELETE']) assert.equal((await request(`/api/tasks/${movementId}`, 'B', { method, ...(method === 'PATCH' ? { body: { status: 'completed' } } : {}) })).status, 404)
  assert.equal((await request('/api/movimientos', 'B', { method: 'POST', body: { rockId, tipo: 'gasto', descripcion: 'Forbidden', categoria: 'Test', monto: '5' } })).status, 404)
  assert.equal((await db.doc(`users/A/payments/${movementId}`).get()).data()!.status, 'pending')
  assert.equal((await db.collection('users').doc('B').collection('payments').get()).size, 0)
  assert.equal((await request('/api/tasks/legacy-B', 'A', { method: 'DELETE' })).status, 404)
  assert.equal((await db.doc('payments/legacy-B').get()).exists, true)
})

test('movement status recalculates the period; new pending work reopens a completed period', async () => {
  const response = await request(`/api/tasks/${movementId}`, 'A', { method: 'PATCH', body: { status: 'completed' } })
  assert.equal(response.status, 200, await response.clone().text())
  assert.equal((await response.json()).newSprintStatus, 'completed')
  assert.equal((await request(`/api/tasks/${movementId}`, 'A', { method: 'PATCH', body: { status: 'pending' } })).status, 422)
  await repository.createMovement('A', movementInput.parse({ fecha: costaRicaDate(), tipo: 'ingreso', descripcion: 'New task', categoria: 'Test', monto: '1' }))
  assert.equal((await db.doc(`users/A/sprints/${sprintId}`).get()).data()!.status, 'in_progress')
})

test('concurrent cuota payments are idempotent and all related records belong to the owner', async () => {
  const created = await request('/api/cuotas', 'A', { method: 'POST', body: { nombre: 'Subscription', frecuencia: 'mensual', monto: '50.25', categoria: 'Test' } })
  assert.equal(created.status, 200)
  cuotaId = (await created.json()).id
  const responses = await Promise.all([1, 2].map(() => request(`/api/cuotas/${cuotaId}`, 'A', { method: 'PATCH', body: { action: 'marcar_pagada' } })))
  for (const response of responses) assert.equal(response.status, 200, await response.clone().text())
  const movements = await db.collection('users').doc('A').collection('payments').where('origin', '==', 'cuota').get()
  assert.equal(movements.size, 1)
  assert.equal(movements.docs[0]!.data().amountMinor, 5025)
  assert.equal((await db.doc(`users/A/cuotas/${cuotaId}`).get()).data()!.ultimoPago, costaRicaDate())
})

test('IDOR: cuotas cannot be paid/deleted by another user; same ID in two user paths stays independent', async () => {
  assert.equal((await request(`/api/cuotas/${cuotaId}`, 'B', { method: 'PATCH', body: {} })).status, 404)
  assert.equal((await request(`/api/cuotas/${cuotaId}`, 'B', { method: 'DELETE' })).status, 404)
  const b = await repository.createCuota('B', cuotaInput.parse({ nombre: 'B quota', frecuencia: 'anual', monto: '20', categoria: 'B' }))
  await db.doc(`users/B/cuotas/${cuotaId}`).set({ ...(await db.doc(`users/B/cuotas/${b.id}`).get()).data(), id: cuotaId })
  assert.equal((await request(`/api/cuotas/${cuotaId}`, 'B', { method: 'DELETE' })).status, 200)
  assert.equal((await db.doc(`users/A/cuotas/${cuotaId}`).get()).exists, true)
})

test('imported payments are hidden only for their owner; original Android records are retained', async () => {
  const response = await request('/api/tasks/legacy-A', 'A', { method: 'DELETE' })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).sourceRetained, true)
  assert.equal((await db.doc('payments/legacy-A').get()).exists, true)
  assert.equal((await db.doc('users/A/hiddenPayments/legacy-A').get()).data()!.userId, 'A')
  assert.ok(!(await (await request('/api/tasks')).text()).includes('legacy-A'))
  assert.ok((await (await request('/api/tasks', 'B')).text()).includes('legacy-B'))
})

test('API gate authenticates normalized paths and denies unsupported operations', async () => {
  for (const path of ['/api/chat', '/api/chat/', '/api//chat', '/api/%63hat', '/api/%2563hat', '/api%252fchat', '/api/tasks/%252e%252e%252fchat', '/API/CHAT', '/api/upload', '/api/documents/temp-id', '/api/future-private']) {
    assert.equal((await request(path, null, { method: 'POST', body: {} })).status, 401)
    const normalized = new URL(decodeURIComponent(path).replace(/\/+/g, '/'), 'http://localhost').pathname.toLowerCase().replace(/\/$/, '')
    assert.equal((await request(path, 'A', { method: 'POST', body: {} })).status, ['/api/chat', '/api/upload'].includes(normalized) ? 404 : 503)
  }
})

test('direct browser Firestore writes to private user paths are denied by emulator rules', async () => {
  const endpoint = `http://${emulator.host}/v1/projects/demo-control-finanzas/databases/(default)/documents/users/A/payments/forged`
  const response = await fetch(endpoint, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fields: { userId: { stringValue: 'A' } } }) })
  assert.equal(response.status, 403)
  assert.equal((await db.doc('users/A/payments/forged').get()).exists, false)
})

test('malformed nested ownership is never exposed or modifiable, even under the caller path', async () => {
  const task = (await db.doc(`users/A/payments/${movementId}`).get()).data()!
  await db.doc('users/A/payments/forged-owner').set({ ...task, id: 'forged-owner', userId: 'B', description: 'FOREIGN OWNERSHIP SECRET' })
  assert.ok(!(await (await request('/api/tasks')).text()).includes('FOREIGN OWNERSHIP SECRET'))
  assert.equal((await request('/api/tasks/forged-owner', 'A', { method: 'DELETE' })).status, 404)
})

test('source/nested duplicates count once and cannot reappear after owner deletion', async () => {
  const task = (await db.doc(`users/A/payments/${movementId}`).get()).data()!
  await db.doc('payments/duplicate-import').set({ userId: 'A', parsed: true, amount: 0.25, currency: 'CRC', timestamp: Date.now() })
  await db.doc('users/A/payments/duplicate-import').set({ ...task, id: 'duplicate-import', monto: '0.25', amountMinor: 25 })
  assert.equal((await repository.loadMovements('A')).items.filter(row => row.id === 'duplicate-import').length, 1)
  assert.equal((await request('/api/tasks/duplicate-import', 'A', { method: 'DELETE' })).status, 200)
  assert.ok(!(await repository.loadMovements('A')).items.some(row => row.id === 'duplicate-import'))
  assert.equal((await db.doc('payments/duplicate-import').get()).exists, true)
})

test('paying an already-paid cuota still rejects foreign account IDs before any writes', async () => {
  await db.doc('users/B/rocks/R-FGN1').set({ id: 'R-FGN1', userId: 'B', name: 'B Account' })
  const before = (await db.collection('users').doc('A').collection('payments').get()).size
  assert.equal((await request(`/api/cuotas/${cuotaId}`, 'A', { method: 'PATCH', body: { rockId: 'R-FGN1' } })).status, 404)
  assert.equal((await db.collection('users').doc('A').collection('payments').get()).size, before)
})

test('bounded JSON input rejects oversized bodies and non-JSON content', async () => {
  assert.equal((await request('/api/movimientos', 'A', { method: 'POST', body: { descripcion: 'x'.repeat(21000) } })).status, 413)
  assert.equal((await fetch(url + '/api/movimientos', { method: 'POST', headers: { cookie: '__Host-finanzas-session=A', origin, 'content-type': 'text/plain' }, body: '{}' })).status, 415)
})

test('private API rate limit is per verified user and service errors reveal no details', async () => {
  const auth = createAuthService({ production: true, origin: () => origin, provider: async () => provider })
  const handlers = createFinanceHandlers({ user: auth.requireUser, origin: auth.requireOrigin, repository: () => repository, write: runFinanceOperation })
  const broken = createFinanceHandlers({ user: auth.requireUser, origin: auth.requireOrigin, repository: () => { throw new Error('SECRET DATABASE DETAIL') }, write: runFinanceOperation })
  const http = createServer(toNodeListener(createApp({ debug: false }).use(createRouter().patch('/limited', eventHandler(handlers.updateSprint)).get('/broken', eventHandler(broken.dashboard)))))
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(http.address() as { port: number }).port}`
  try {
    for (let i = 0; i < 120; i++) {
      const response = await fetch(base + '/limited', { method: 'PATCH', headers: { origin, cookie: '__Host-finanzas-session=A' } })
      assert.equal(response.status, 405)
      await response.text()
    }
    const limited = await fetch(base + '/limited', { method: 'PATCH', headers: { origin, cookie: '__Host-finanzas-session=A' } })
    assert.equal(limited.status, 429)
    assert.ok(limited.headers.get('retry-after'))
    assert.equal((await fetch(base + '/limited', { method: 'PATCH', headers: { origin, cookie: '__Host-finanzas-session=B' } })).status, 405)
    const failed = await fetch(base + '/broken', { headers: { cookie: '__Host-finanzas-session=B' } })
    assert.equal(failed.status, 503)
    assert.ok(!(await failed.text()).includes('SECRET DATABASE DETAIL'))
  } finally {
    http.closeAllConnections()
    await new Promise<void>(resolve => http.close(() => resolve()))
  }
})

test('previous-period cuotas remain pending and paused cuotas cannot generate payments', async () => {
  const data = (await db.doc(`users/A/cuotas/${cuotaId}`).get()).data()!
  await db.doc('users/A/cuotas/U-OLD1').set({ ...data, id: 'U-OLD1', ultimoPago: '2000-01-01' })
  await db.doc('users/A/cuotas/U-PAUS').set({ ...data, id: 'U-PAUS', ultimoPago: null, status: 'paused' })
  assert.equal((await repository.dashboard('A')).cuotas.pendientes, 1)
  const before = (await db.collection('users').doc('A').collection('payments').get()).size
  assert.equal((await request('/api/cuotas/U-PAUS', 'A', { method: 'PATCH', body: {} })).status, 422)
  assert.equal((await db.collection('users').doc('A').collection('payments').get()).size, before)
})

test('Android-compatible rules allow bounded owner captures and reject ownership/size violations', async () => {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const token = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: 'A', user_id: 'A', aud: 'demo-control-finanzas', iss: 'https://securetoken.google.com/demo-control-finanzas', iat: now, exp: now + 3600, auth_time: now, firebase: { sign_in_provider: 'anonymous', identities: {} } })}.`
  const endpoint = `http://${emulator.host}/v1/projects/demo-control-finanzas/databases/(default)/documents/payments/`
  const fields = { userId: { stringValue: 'A' }, parsed: { booleanValue: true }, currency: { stringValue: 'CRC' }, amount: { doubleValue: 1.5 }, timestamp: { integerValue: String(Date.now()) }, merchant: { stringValue: 'Store' }, rawText: { stringValue: 'Original notification' } }
  const capture = (id: string, extra: object = {}) => fetch(endpoint + id, { method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ fields: { ...fields, ...extra } }) })
  assert.equal((await capture('rules-valid')).status, 200)
  assert.equal((await capture('rules-forged', { userId: { stringValue: 'B' } })).status, 403)
  assert.equal((await capture('rules-large', { merchant: { stringValue: 'x'.repeat(401) } })).status, 403)
  assert.equal((await capture('rules-invalid', { amount: { doubleValue: -1 } })).status, 403)
})

test('historical movements preserve their dates without creating an expired default account', async () => {
  const created = await repository.createMovement('HISTORY', movementInput.parse({ fecha: '2010-02-01', tipo: 'gasto', descripcion: 'Historical expense', categoria: 'Test', monto: '12' }))
  const movement = (await db.doc(`users/HISTORY/payments/${created.id}`).get()).data()!
  assert.equal(movement.deadline, '2010-02-01')
  const account = (await db.doc(`users/HISTORY/rocks/${movement.rockId}`).get()).data()!
  assert.ok(account.deadline > costaRicaDate())
  assert.equal((await repository.monthlySummary('HISTORY', '2010-02')).gastos, 12)
})

const session = crypto.randomUUID()
function proposal() { return { rock: { name: 'Private plan', description: 'A only', deadline: '2099-12-31' }, sprints: [{ name: 'Period', startDate: '2099-01-01', endDate: '2099-01-31', tasks: [{ description: 'Private movement', owner: 'Fede', deadline: '2099-01-10', priority: 'high', monto: '1.25', tipo: 'gasto', selected: true }] }] } }

test('durable approvals bind owner/session/kind; concurrent replay creates one plan', async () => {
  const agents = new AgentRepository(db), id = crypto.randomUUID()
  await agents.saveAction('AGENT-A', session, id, 'plan', proposal())
  await assert.rejects(agents.approvePlan('AGENT-B', session, id))
  await assert.rejects(agents.approvePlan('AGENT-A', crypto.randomUUID(), id))
  await assert.rejects(agents.getAction('AGENT-A', session, id, 'tasks'))
  const [first, second] = await Promise.all([agents.approvePlan('AGENT-A', session, id), agents.approvePlan('AGENT-A', session, id)])
  assert.deepEqual(first, second)
  assert.equal((await db.collection('users/AGENT-A/rocks').get()).size, 1)
  assert.equal((await agents.loadMovements('AGENT-A')).items[0]?.monto, '1.25')
  await assert.rejects(agents.queryRock('AGENT-B', first.rockId))
  await assert.rejects(agents.getTask('AGENT-B', first.taskIds[0]))
  const statusId = crypto.randomUUID()
  await agents.saveAction('AGENT-A', session, statusId, 'status', { taskId: first.taskIds[0] })
  await assert.rejects(agents.changeStatus('AGENT-A', first.taskIds[0], 'completed', { sessionId: crypto.randomUUID(), actionId: statusId }))
  const status = await agents.changeStatus('AGENT-A', first.taskIds[0], 'completed', { sessionId: session, actionId: statusId })
  assert.deepEqual(await agents.changeStatus('AGENT-A', first.taskIds[0], 'pending', { sessionId: session, actionId: statusId }), status)
})

test('edited approval fields are validated atomically; expiry, cancellation and stale edits fail', async () => {
  const agents = new AgentRepository(db), id = crypto.randomUUID()
  await agents.saveAction('EDIT-A', session, id, 'plan', proposal())
  await assert.rejects(agents.approvePlan('EDIT-A', session, id, { ...proposal(), userId: 'B' }))
  const invalid = proposal(); invalid.sprints[0]!.tasks[0]!.monto = '1.001'
  await assert.rejects(agents.approvePlan('EDIT-A', session, id, invalid))
  assert.equal((await db.collection('users/EDIT-A/rocks').get()).size, 0)
  await agents.replacePlan('EDIT-A', session, id, 0, proposal())
  await assert.rejects(agents.replacePlan('EDIT-A', session, id, 0, proposal()))
  await agents.cancelAction('EDIT-A', session, id, 'plan')
  await assert.rejects(agents.approvePlan('EDIT-A', session, id))
  const expired = crypto.randomUUID()
  await agents.saveAction('EDIT-A', session, expired, 'plan', proposal())
  await db.doc(`users/EDIT-A/pendingActions/${expired}`).update({ expiresAt: 0 })
  await assert.rejects(agents.approvePlan('EDIT-A', session, expired))
})

test('task approvals cannot change anchors and deletion needs the correct durable approval', async () => {
  const agents = new AgentRepository(db), id = crypto.randomUUID()
  await agents.saveAction('TASK-A', session, id, 'plan', proposal())
  const plan = await agents.approvePlan('TASK-A', session, id)
  const tasksId = crypto.randomUUID()
  await agents.saveAction('TASK-A', session, tasksId, 'tasks', { rockId: plan.rockId, sprintId: plan.sprintIds[0], tasks: proposal().sprints[0]!.tasks })
  await assert.rejects(agents.approveTasks('TASK-B', session, tasksId))
  const result = await agents.approveTasks('TASK-A', session, tasksId)
  assert.deepEqual(await agents.approveTasks('TASK-A', session, tasksId), result)
  assert.equal((await agents.deleteRock('TASK-A', plan.rockId)).needsConfirmation, true)
  const deletion = crypto.randomUUID()
  await agents.saveAction('TASK-A', session, deletion, 'delete', { rockId: plan.rockId })
  await assert.rejects(agents.deleteRock('TASK-B', plan.rockId, { sessionId: session, actionId: deletion }))
  assert.equal((await agents.deleteRock('TASK-A', plan.rockId, { sessionId: session, actionId: deletion })).deleted, true)
  assert.equal((await db.collection('users/TASK-A/payments').get()).size, 0)
})

test('private document ingestion, RAG and cancellation never access another owner', async () => {
  const files = new Map<string, Buffer>()
  const docs = new DocumentRepository(db, { save: async (path, bytes) => { files.set(path, bytes) }, remove: async path => { files.delete(path) } }, async () => [1, 0, 0])
  const row = await docs.ingest('DOC-A', { filename: 'statement.txt', mime: 'text/plain', bytes: Buffer.from('Private A statement: invoice paid.') })
  assert.equal((await docs.search('DOC-A', 'invoice'))[0]?.chunkText, 'Private A statement: invoice paid.')
  assert.deepEqual(await docs.search('DOC-B', 'invoice'), [])
  await assert.rejects(docs.summary('DOC-B', row.documentId))
  await assert.rejects(docs.removeProvisional('DOC-B', row.documentId))
  assert.equal(files.size, 2)
  await assert.rejects(docs.removeProvisional('DOC-A', row.documentId, true))
  const agents = new AgentRepository(db), id = crypto.randomUUID()
  await agents.saveAction('DOC-A', session, id, 'plan', proposal())
  await assert.rejects(agents.approvePlan('DOC-A', session, id, undefined, 'foreign-document'))
  assert.equal((await db.collection('users/DOC-A/rocks').get()).size, 0)
  await docs.removeProvisional('DOC-A', row.documentId)
  assert.equal(files.size, 0)
  assert.deepEqual(await docs.search('DOC-A', 'invoice'), [])
  const linked = await docs.ingest('DOC-A', { filename: 'linked.txt', mime: 'text/plain', bytes: Buffer.from('Linked document') })
  await agents.approvePlan('DOC-A', session, id, undefined, linked.documentId)
  await assert.rejects(docs.removeProvisional('DOC-A', linked.documentId))
  assert.equal((await docs.search('DOC-A', 'linked'))[0]?.chunkText, 'Linked document')
})

test('upload validation and embedding failures leave no searchable content', async () => {
  assert.doesNotThrow(() => validateFile(Buffer.from('# Existing Markdown'), 'notes.md', 'text/markdown'))
  assert.throws(() => validateFile(Buffer.from('not pdf'), 'fake.pdf', 'application/pdf'))
  assert.throws(() => validateFile(Buffer.from([0xff]), 'bad.txt', 'text/plain'))
  assert.throws(() => validateFile(Buffer.from('ok'), '../bad.txt', 'text/plain'))
  assert.throws(() => validateFile(Buffer.from('ok'), 'bad.exe', 'text/plain'))
  const files = new Map<string, Buffer>()
  const docs = new DocumentRepository(db, { save: async (path, bytes) => { files.set(path, bytes) }, remove: async path => { files.delete(path) } }, async () => [NaN])
  await assert.rejects(docs.ingest('FAIL-A', { filename: 'test.csv', mime: 'text/csv', bytes: Buffer.from('amount,1') }))
  assert.equal(files.size, 0)
  assert.equal((await db.collection('users/FAIL-A/documentChunks').get()).size, 0)
})

test('distributed quotas reject excess requests and stay isolated by owner', async () => {
  const agents = new AgentRepository(db)
  await agents.quota('QUOTA-A', 'chat', 1, 86400000)
  await assert.rejects(agents.quota('QUOTA-A', 'chat', 1, 86400000))
  await agents.quota('QUOTA-B', 'chat', 1, 86400000)
})

test('migration reruns create no duplicates and never overwrite destination or hidden IDs', async () => {
  const source = { rocks: [{ id: 'R-MIGR', name: 'Legacy', description: 'Test', deadline: '2020-01-31', status: 'active', created_at: '2020-01-01T00:00:00.000Z' }], sprints: [], tasks: [], cuotas: [], documents: [], document_chunks: [] }
  const plan = migrationPlan(source, 'MIG-A')
  assert.equal((await checkMigration(db, plan)).missing, 1)
  assert.equal((await applyMigration(db, plan)).present, 1)
  assert.equal((await applyMigration(db, plan)).present, 1)
  assert.equal((await db.collection('users/MIG-A/rocks').get()).size, 1)
  assert.equal((await db.collection('users/MIG-B/rocks').get()).size, 0)
  await db.doc('users/MIG-A/rocks/R-MIGR').update({ name: 'User edit' })
  await assert.rejects(applyMigration(db, plan))
  assert.equal((await db.doc('users/MIG-A/rocks/R-MIGR').get()).data()?.name, 'User edit')
})

test('chat HTTP passes only cookie UID, validates input and preserves ordered SSE with one done', async () => {
  const auth = createAuthService({ production: true, origin: () => origin, provider: async () => provider })
  let calls = 0, fail = false
  const handler = createChatHandler({ user: auth.requireUser, origin: auth.requireOrigin, quota: async () => {}, graph: async input => {
    calls++
    assert.equal(input.uid, 'A')
    input.onEvent?.({ type: 'status', data: { message: 'Running' } })
    if (fail) throw new Error('PRIVATE PROVIDER ERROR')
    input.onEvent?.({ type: 'result', data: { message: 'Finished' } })
    return { judgeWarning: null, guardrailError: null }
  } })
  const http = createServer(toNodeListener(createApp({ debug: false }).use(createRouter().post('/chat', handler))))
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve))
  const endpoint = `http://127.0.0.1:${(http.address() as { port: number }).port}/chat`
  const send = (body: unknown, cookie = 'A', requestOrigin = origin) => fetch(endpoint, { method: 'POST', headers: { origin: requestOrigin, cookie: `__Host-finanzas-session=${cookie}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  try {
    const body = { sessionId: session, message: 'Hello' }
    assert.equal((await send(body, '')).status, 401)
    assert.equal((await send(body, 'A', 'https://attacker.invalid')).status, 403)
    assert.equal((await send({ ...body, uid: 'B' })).status, 400)
    assert.equal((await send({ ...body, sessionId: 'default-session' })).status, 400)
    assert.equal(calls, 0)
    const response = await send(body), output = await response.text()
    assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8')
    const events = output.trim().split('\n\n').map(line => JSON.parse(line.slice(6)).type)
    assert.deepEqual(events, ['status', 'result', 'done'])
    fail = true
    const failed = await (await send(body)).text()
    assert.ok(!failed.includes('PRIVATE PROVIDER ERROR'))
    assert.deepEqual(failed.trim().split('\n\n').map(line => JSON.parse(line.slice(6)).type), ['status', 'error', 'done'])
  } finally { http.closeAllConnections(); await new Promise<void>(resolve => http.close(() => resolve())) }
})

test('chat category/recent queries use only the authenticated owner and never mutate source payments', async () => {
  const previous = { project: process.env.FIREBASE_PROJECT_ID, mode: process.env.NODE_ENV }
  process.env.FIREBASE_PROJECT_ID = 'demo-control-finanzas'
  process.env.NODE_ENV = 'test'
  const chatApp = initializeApp(app.options, 'control-finanzas')
  try {
    const timestamp = new Date(`${month}-10T18:00:00Z`).getTime()
    for (const [id, userId, amount, direction, offset] of [
      ['chat-expense-one', 'CHAT-A', 0.1, 'purchase', 0],
      ['chat-expense-two', 'CHAT-A', 0.2, 'purchase', 1000],
      ['chat-income', 'CHAT-A', 1000, 'incoming', 2000],
      ['chat-foreign', 'CHAT-B', 999999, 'purchase', 3000]
    ] as const) {
      await db.collection('payments').doc(id).set({ userId, parsed: true, amount, currency: 'CRC', direction, timestamp: timestamp + offset, category: userId === 'CHAT-A' ? 'Comida QA' : 'FOREIGN CATEGORY', merchant: id })
    }
    const sessionId = crypto.randomUUID()
    const before = await db.collection('payments').where('userId', 'in', ['CHAT-A', 'CHAT-B']).get()
    const category = await runDataOperation({ uid: 'CHAT-A', sessionId, operation: 'category_report', message: `Gastos por categoría de ${month}` })
    assert.ok(String(category.message).includes('Comida QA: ₡0.30'))
    assert.ok(!String(category.message).includes('FOREIGN'))
    assert.ok(!String(category.message).includes('1000.00'))
    const recent = await runDataOperation({ uid: 'CHAT-A', sessionId, operation: 'recent_movements', message: 'Muéstrame mis últimos dos movimientos.', payload: { limit: 2, userId: 'CHAT-B' } })
    assert.ok(String(recent.message).includes('2 de 3'))
    assert.ok(String(recent.message).includes('chat\\-income'))
    assert.ok(!String(recent.message).includes('chat\\-expense\\-one'))
    assert.ok(!String(recent.message).includes('FOREIGN'))
    assert.ok(!String(recent.message).includes('999999'))
    const invalid = await runDataOperation({ uid: 'CHAT-A', sessionId, operation: 'recent_movements', message: 'Muéstrame mis movimientos.', payload: { limit: 100 } })
    assert.match(String(invalid.message), /entre 1 y 20/)
    const ambiguous = await runDataOperation({ uid: 'CHAT-A', sessionId, operation: 'category_report', message: 'Gastos por categoría de ayer' })
    assert.match(String(ambiguous.message), /indica un único mes/)
    const filtered = await runDataOperation({ uid: 'CHAT-A', sessionId, operation: 'recent_movements', message: 'Muéstrame mis últimos cinco gastos.' })
    assert.match(String(filtered.message), /filtros por tipo/)
    const incomeCategory = await runDataOperation({ uid: 'CHAT-A', sessionId, operation: 'category_report', message: 'Ingresos por categoría este mes' })
    assert.match(String(incomeCategory.message), /solo de gastos/)
    const after = await db.collection('payments').where('userId', 'in', ['CHAT-A', 'CHAT-B']).get()
    assert.deepEqual(after.docs.map(row => row.data()), before.docs.map(row => row.data()))
  } finally {
    await getFirestore(chatApp).terminate()
    await deleteApp(chatApp)
    if (previous.project === undefined) delete process.env.FIREBASE_PROJECT_ID; else process.env.FIREBASE_PROJECT_ID = previous.project
    if (previous.mode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.mode
  }
})
