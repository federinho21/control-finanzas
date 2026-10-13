import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, test } from 'node:test'
import { createApp, eventHandler, toNodeListener } from 'h3'
import { createAuthService, type AuthProvider, type VerifiedIdentity } from '../server/utils/auth-service'
import { getFirebaseAuth } from '../server/firebase/admin'

const time = 1800000000000
const identity: VerifiedIdentity = {
  uid: 'verified-user', email: 'test@example.invalid', name: 'Test',
  auth_time: time / 1000, firebase: { sign_in_provider: 'google.com' }
}
const calls: string[] = []
let revoked = false
const provider: AuthProvider = {
  async verifyIdToken(token, check) {
    assert.equal(check, true)
    calls.push('verify-token')
    if (token === 'bad') throw new Error('SECRET INTERNAL DETAIL')
    if (token === 'old') return { ...identity, auth_time: identity.auth_time - 301 }
    if (token === 'anonymous') return { ...identity, firebase: { sign_in_provider: 'anonymous' } }
    return identity
  },
  async createSessionCookie(token, options) {
    assert.equal(options.expiresIn, 432000000)
    calls.push('create-cookie')
    return `signed-${token}`
  },
  async verifySessionCookie(cookie, check) {
    assert.equal(check, true)
    calls.push('verify-cookie')
    if (cookie === 'signed-other') return { ...identity, uid: 'other-user' }
    if (cookie !== 'signed-good' || revoked) throw new Error('SECRET INTERNAL DETAIL')
    return identity
  },
  async revokeRefreshTokens(uid) {
    assert.equal(uid, identity.uid)
    revoked = true
  }
}

async function fixture(production = true) {
  const service = createAuthService({ production, provider: async () => provider, origin: () => 'https://finance.example', now: () => time })
  const app = createApp({ debug: false })
  app.use('/session', eventHandler(event => event.method === 'DELETE' ? service.deleteSession(event) : service.createSession(event)))
  app.use('/me', eventHandler(async event => {
    await service.requireUser(event)
    return { user: await service.requireUser(event) }
  }))
  const server = createServer(toNodeListener(app))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  const url = `http://127.0.0.1:${address.port}`
  after(() => new Promise<void>(resolve => server.close(() => resolve())))
  const login = (body: unknown, origin = 'https://finance.example') => fetch(`${url}/session`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body)
  })
  return { url, login }
}

test('valid Google login issues only a secure HttpOnly host cookie', async () => {
  const { login } = await fixture()
  const response = await login({ idToken: 'good' })
  assert.equal(response.status, 200)
  const cookie = response.headers.get('set-cookie')!
  for (const flag of ['__Host-finanzas-session=signed-good', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=432000']) assert.ok(cookie.includes(flag), flag)
  assert.ok(!cookie.includes('Domain='))
  assert.deepEqual(await response.json(), { user: { uid: identity.uid, email: identity.email, name: identity.name } })
})

test('missing, expired, forged and revoked cookies fail closed', async () => {
  const { url } = await fixture()
  for (const cookie of ['', '__Host-finanzas-session=forged', '__Host-finanzas-session=expired']) {
    const response = await fetch(`${url}/me`, { headers: { cookie } })
    assert.equal(response.status, 401)
    assert.ok(!(await response.text()).includes('SECRET INTERNAL DETAIL'))
  }
})

test('identity comes only from verified cookie; client userId and sessionId cannot authenticate', async () => {
  const { url, login } = await fixture()
  assert.equal((await login({ idToken: 'good', userId: 'victim' })).status, 400)
  assert.equal((await fetch(`${url}/me?userId=victim&sessionId=known`)).status, 401)
  const response = await fetch(`${url}/me?userId=victim`, { headers: { cookie: '__Host-finanzas-session=signed-good' } })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).user.uid, identity.uid)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const other = await fetch(`${url}/me?userId=verified-user`, { headers: { cookie: '__Host-finanzas-session=signed-other' } })
  assert.equal((await other.json()).user.uid, 'other-user')
})

test('verification is reused only inside the same request, never between users/requests', async () => {
  const { url } = await fixture()
  const before = calls.filter(call => call === 'verify-cookie').length
  await fetch(`${url}/me`, { headers: { cookie: '__Host-finanzas-session=signed-good' } })
  await fetch(`${url}/me`, { headers: { cookie: '__Host-finanzas-session=signed-other' } })
  assert.equal(calls.filter(call => call === 'verify-cookie').length - before, 2)
})

test('CSRF: missing or foreign Origin is denied before token verification', async () => {
  const { login } = await fixture()
  const before = calls.length
  assert.equal((await login({ idToken: 'good' }, 'https://attacker.example')).status, 403)
  assert.equal((await login({ idToken: 'good' }, '')).status, 403)
  assert.equal(calls.length, before)
})

test('invalid, old and anonymous ID tokens are denied without exposing details', async () => {
  const { login } = await fixture()
  for (const idToken of ['bad', 'old', 'anonymous']) {
    const response = await login({ idToken })
    assert.equal(response.status, 401)
    assert.ok(!(await response.text()).includes('SECRET INTERNAL DETAIL'))
  }
})

test('strict input and streaming body limit reject malformed and oversized requests', async () => {
  const { url, login } = await fixture()
  assert.equal((await login({})).status, 400)
  assert.equal((await login({ idToken: 23 })).status, 400)
  assert.equal((await login({ idToken: 'x'.repeat(21000) })).status, 413)
  assert.equal((await fetch(`${url}/session`, { method: 'POST', headers: { origin: 'https://finance.example', 'content-type': 'application/json' }, body: '{' })).status, 400)
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('x'.repeat(21000))); controller.close() } })
  const response = await fetch(`${url}/session`, { method: 'POST', headers: { origin: 'https://finance.example', 'content-type': 'application/json' }, body: stream, duplex: 'half' } as RequestInit)
  assert.equal(response.status, 413)
})

test('session creation is limited per instance and ignores spoofed forwarded headers', async () => {
  const { url, login } = await fixture()
  for (let i = 0; i < 10; i++) assert.equal((await login({ idToken: 'bad' })).status, 401)
  const response = await fetch(`${url}/session`, { method: 'POST', headers: { origin: 'https://finance.example', 'content-type': 'application/json', 'x-forwarded-for': 'spoofed' }, body: JSON.stringify({ idToken: 'good' }) })
  assert.equal(response.status, 429)
  assert.equal(response.headers.get('retry-after'), '60')
})

test('localhost cookie is non-Secure while remaining HttpOnly', async () => {
  const { login } = await fixture(false)
  const cookie = (await login({ idToken: 'good' })).headers.get('set-cookie')!
  assert.ok(cookie.startsWith('finanzas_session='))
  assert.ok(cookie.includes('HttpOnly'))
  assert.ok(!cookie.includes('Secure'))
})

test('Admin refuses Cloudflare, missing project and production emulator without contacting Firebase', () => {
  const previous = { target: process.env.DEPLOY_TARGET, project: process.env.FIREBASE_PROJECT_ID, mode: process.env.NODE_ENV, emulator: process.env.FIREBASE_AUTH_EMULATOR_HOST, firestore: process.env.FIRESTORE_EMULATOR_HOST }
  try {
    process.env.DEPLOY_TARGET = 'cloudflare'
    assert.throws(getFirebaseAuth, /Node deployment/)
    delete process.env.DEPLOY_TARGET
    delete process.env.FIREBASE_PROJECT_ID
    assert.throws(getFirebaseAuth, /FIREBASE_PROJECT_ID/)
    process.env.FIREBASE_PROJECT_ID = 'demo-test'
    process.env.NODE_ENV = 'production'
    process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099'
    assert.throws(getFirebaseAuth, /forbidden/)
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080'
    assert.throws(getFirebaseAuth, /forbidden/)
  } finally {
    for (const [key, value] of Object.entries({ DEPLOY_TARGET: previous.target, FIREBASE_PROJECT_ID: previous.project, NODE_ENV: previous.mode, FIREBASE_AUTH_EMULATOR_HOST: previous.emulator, FIRESTORE_EMULATOR_HOST: previous.firestore })) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test('logout denies CSRF, revokes all user sessions and clears cookie', async () => {
  const { url } = await fixture()
  const rejected = await fetch(`${url}/session`, { method: 'DELETE', headers: { origin: 'https://attacker.example', cookie: '__Host-finanzas-session=signed-good' } })
  assert.equal(rejected.status, 403)
  assert.equal(revoked, false)
  const response = await fetch(`${url}/session`, { method: 'DELETE', headers: { origin: 'https://finance.example', cookie: '__Host-finanzas-session=signed-good' } })
  assert.equal(response.status, 200)
  assert.ok(response.headers.get('set-cookie')?.includes('Max-Age=0'))
  assert.equal((await fetch(`${url}/me`, { headers: { cookie: '__Host-finanzas-session=signed-good' } })).status, 401)
})
