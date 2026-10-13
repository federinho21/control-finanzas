import assert from 'node:assert/strict'
import { stat } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const sqliteTime = (await stat('.data/hackathon.db').catch(() => null))?.mtimeMs
process.env.NODE_ENV = 'production'
process.env.AUTH_ORIGIN = 'https://finance-test.netlify.app'
process.env.FIREBASE_PROJECT_ID = ''
delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON
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
