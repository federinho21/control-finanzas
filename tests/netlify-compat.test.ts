import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp, eventHandler, toWebHandler } from 'h3'
import { createChatHandler } from '../server/api/chat.post'
import { readLimitedJson } from '../server/utils/request-input'
import { getFirebaseAuth } from '../server/firebase/admin'
import { generateKeyPairSync } from 'node:crypto'
import { deleteApp } from 'firebase-admin/app'
import { createAuthService } from '../server/utils/auth-service'

test('bounded JSON accepts fetch-adapter bodies and rejects oversized or invalid input', async () => {
  const handler = toWebHandler(createApp({ debug: false }).use(eventHandler(event => readLimitedJson(event, 32))))
  const post = (body: string, headers: Record<string, string> = {}) => handler(new Request('https://finance.example/input', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body }))
  assert.deepEqual(await (await post('{"value":1}')).json(), { value: 1 })
  assert.equal((await post('x'.repeat(33))).status, 413)
  assert.equal((await post('{}', { 'content-length': '100' })).status, 413)
  assert.equal((await post('broken')).status, 400)
  assert.equal((await post('{}', { 'content-type': 'text/plain' })).status, 415)
})

test('fetch-adapter chat delivers status before graph completion and exactly one terminal done', async () => {
  let release!: () => void
  const wait = new Promise<void>(resolve => { release = resolve })
  const handler = toWebHandler(createApp({ debug: false }).use(createChatHandler({ user: async () => ({ uid: 'A' }), origin: () => {}, quota: async () => {}, graph: async input => {
    assert.equal(input.uid, 'A')
    input.onEvent?.({ type: 'status', data: { message: 'Working' } })
    await wait
    input.onEvent?.({ type: 'result', data: { message: 'Complete' } })
    return { judgeWarning: null, guardrailError: null }
  } })))
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const response = await Promise.race([
      handler(new Request('https://finance.example/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: crypto.randomUUID(), message: 'Hello' }) })),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Response was buffered until graph completion.')), 1000) })
    ])
    assert.equal(response.status, 200)
    assert.ok(response.headers.get('content-type')?.includes('text/event-stream'))
    const reader = response.body!.getReader()
    const first = await reader.read()
    const decoder = new TextDecoder()
    let output = decoder.decode(first.value)
    assert.equal(JSON.parse(output.trim().slice(6)).type, 'status')
    release()
    for (;;) { const chunk = await reader.read(); if (chunk.done) break; output += decoder.decode(chunk.value) }
    assert.deepEqual(output.trim().split('\n\n').map(line => JSON.parse(line.slice(6)).type), ['status', 'result', 'done'])
  } finally { release(); if (timer) clearTimeout(timer) }
})

test('Admin rejects malformed or cross-project environment credentials without exposing them', () => {
  const previous = { project: process.env.FIREBASE_PROJECT_ID, credential: process.env.FIREBASE_SERVICE_ACCOUNT_JSON }
  try {
    process.env.FIREBASE_PROJECT_ID = 'demo-netlify'
    for (const credential of ['PRIVATE_INVALID_JSON', JSON.stringify({ project_id: 'another-project', client_email: 'test@example.invalid', private_key: 'PRIVATE_KEY_SENTINEL' })]) {
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON = credential
      assert.throws(getFirebaseAuth, error => error instanceof Error && error.message === 'Invalid Firebase server credentials.')
    }
  } finally {
    for (const [key, value] of Object.entries({ FIREBASE_PROJECT_ID: previous.project, FIREBASE_SERVICE_ACCOUNT_JSON: previous.credential })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value
    }
  }
})

test('Admin accepts a dummy same-project service account without contacting Google', async () => {
  const previous = { project: process.env.FIREBASE_PROJECT_ID, credential: process.env.FIREBASE_SERVICE_ACCOUNT_JSON }
  let auth: ReturnType<typeof getFirebaseAuth> | undefined
  try {
    const key = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    process.env.FIREBASE_PROJECT_ID = 'demo-netlify'
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({ type: 'service_account', project_id: 'demo-netlify', client_email: 'test@example.invalid', private_key: key })
    auth = getFirebaseAuth()
    assert.equal(auth.app.options.projectId, 'demo-netlify')
  } finally {
    if (auth) await deleteApp(auth.app)
    for (const [key, value] of Object.entries({ FIREBASE_PROJECT_ID: previous.project, FIREBASE_SERVICE_ACCOUNT_JSON: previous.credential })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value
    }
  }
})

test('fetch-adapter Google session exchange preserves the secure cookie and rejects UID injection', async () => {
  const origin = 'https://finance.example'
  const auth = createAuthService({ production: true, origin: () => origin, provider: async () => ({
    verifyIdToken: async () => ({ uid: 'A', auth_time: Math.floor(Date.now() / 1000), firebase: { sign_in_provider: 'google.com' } }),
    verifySessionCookie: async () => ({ uid: 'A', auth_time: 0, firebase: { sign_in_provider: 'google.com' } }),
    createSessionCookie: async () => 'test-session', revokeRefreshTokens: async () => {}
  }) })
  const handler = toWebHandler(createApp({ debug: false }).use(eventHandler(auth.createSession)))
  const request = (body: unknown, requestOrigin = origin) => handler(new Request(origin + '/api/auth/session', { method: 'POST', headers: { origin: requestOrigin, 'content-type': 'application/json' }, body: JSON.stringify(body) }))
  const response = await request({ idToken: 'test-token' })
  assert.equal(response.status, 200)
  const cookie = response.headers.get('set-cookie')!
  assert.ok(cookie.startsWith('__Host-finanzas-session='))
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) assert.ok(cookie.includes(attribute))
  assert.equal((await request({ idToken: 'test-token', userId: 'B' })).status, 400)
  assert.equal((await request({ idToken: 'test-token' }, 'https://attacker.invalid')).status, 403)
})
