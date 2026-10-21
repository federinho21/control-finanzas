import assert from 'node:assert/strict'
import { startTestServer } from './start-test-server'
import { assertCompiledAiPolicy } from './compiled-ai-policy'

await assertCompiledAiPolicy('.output/server')

const server = await startTestServer()
const origin = server.url
try {
  assert.equal((await fetch(`${origin}/api/auth/me`)).status, 401)
  assert.equal((await fetch(`${origin}/api/auth/session`, {
    method: 'POST', headers: { origin: 'https://attacker.invalid', 'content-type': 'application/json' }, body: JSON.stringify({ idToken: 'invalid' })
  })).status, 403)
  assert.equal((await fetch(`${origin}/api/auth/session`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ idToken: 'invalid' })
  })).status, 503)
  assert.equal((await fetch(`${origin}/api/auth/session`, { method: 'DELETE', headers: { origin } })).status, 401)
  const protectedPage = await fetch(`${origin}/dashboard`, { redirect: 'manual' })
  assert.equal(protectedPage.status, 302)
  assert.equal(protectedPage.headers.get('location'), '/login')
  assert.equal(protectedPage.headers.get('cache-control'), 'no-store')
  assert.equal(protectedPage.headers.get('vary'), 'Cookie')
  for (const path of ['/api/dashboard', '/api/resumen', '/api/tasks', '/api/rocks', '/api/sprints', '/api/cuotas']) {
    assert.equal((await fetch(origin + path)).status, 401)
  }
  for (const path of ['/api/chat', '/api/upload', '/api/documents/temp-id']) {
    assert.equal((await fetch(origin + path, { method: 'POST', headers: { origin } })).status, 401)
  }
  const icons = await fetch(origin + '/api/_nuxt_icon/lucide.json?icons=wallet')
  assert.equal(icons.status, 200)
  assert.ok((await icons.json()).icons.wallet)
  console.log('PASS: compiled AI refusal and 15 Nitro auth/page/API/asset checks; no Firebase calls or production data access.')
  console.log(`Isolated test directory: ${server.directory}`)
} finally {
  server.stop()
}
