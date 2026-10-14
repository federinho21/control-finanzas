import assert from 'node:assert/strict'
import { stat } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const sqliteTime = (await stat('.data/hackathon.db').catch(() => null))?.mtimeMs
process.env.NODE_ENV = 'production'
process.env.AUTH_ORIGIN = 'https://finance-test.netlify.app'
process.env.FIREBASE_PROJECT_ID = ''
delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON
const coldStart = spawnSync(process.execPath, ['--no-experimental-require-module', '--input-type=module', '-e', "await import('./.netlify/functions-internal/server/server.mjs')"], { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } })
assert.equal(coldStart.status, 0, `Plain Node cold start failed: ${coldStart.stderr}`)
const firestoreStart = spawnSync(process.execPath, ['--no-experimental-require-module', '--input-type=module', '-e', `
  import assert from 'node:assert/strict'
  import { generateKeyPairSync } from 'node:crypto'
  const key = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  process.env.FIREBASE_PROJECT_ID = 'demo-netlify'
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({ type: 'service_account', project_id: 'demo-netlify', client_email: 'test@example.invalid', private_key: key })
  const compiled = await import('./.netlify/functions-internal/server/chunks/_/nitro.mjs')
  const factory = Object.values(compiled).find(value => typeof value === 'function' && value.name === 'getFirebaseFirestore')
  assert.equal(typeof factory, 'function')
  const firestore = factory()
  assert.equal(typeof firestore.collection, 'function')
  await firestore.terminate()
`], { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } })
assert.equal(firestoreStart.status, 0, `Compiled Firestore initialization failed: ${firestoreStart.stderr}`)
const { default: handler } = await import(pathToFileURL(resolve('.netlify/functions-internal/server/server.mjs')).href)
const request = (path: string, options: RequestInit = {}) => handler(new Request(process.env.AUTH_ORIGIN + path, options)) as Promise<Response>

assert.equal((await request('/api/auth/me')).status, 401)
assert.equal((await request('/api/auth/session', { method: 'POST', headers: { origin: 'https://attacker.invalid', 'content-type': 'application/json' }, body: '{}' })).status, 403)
assert.equal((await request('/api/auth/session', { method: 'POST', headers: { origin: process.env.AUTH_ORIGIN, 'content-type': 'application/json' }, body: 'invalid-json' })).status, 400)
assert.equal((await request('/api/auth/session', { method: 'POST', headers: { origin: process.env.AUTH_ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ idToken: 'invalid-token' }) })).status, 503)
const page = await request('/dashboard')
assert.equal(page.status, 302)
assert.equal(page.headers.get('location'), '/login')
for (const path of ['/api/dashboard', '/api/resumen', '/api/tasks', '/api/rocks', '/api/sprints', '/api/cuotas']) assert.equal((await request(path)).status, 401)
for (const [path, method] of [['/api/chat', 'POST'], ['/api/upload', 'POST'], ['/api/documents/temp-id', 'DELETE']]) assert.equal((await request(path!, { method, headers: { origin: process.env.AUTH_ORIGIN } })).status, 401)
const icons = await request('/api/_nuxt_icon/lucide.json?icons=wallet')
assert.equal(icons.status, 200)
assert.ok((await icons.json()).icons.wallet)
assert.equal((await stat('.data/hackathon.db').catch(() => null))?.mtimeMs, sqliteTime)
console.log('PASS: 15 compiled Netlify route checks; missing credentials fail closed; no Firebase network calls or SQLite writes.')
