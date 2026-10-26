import assert from 'node:assert/strict'
import { startTestServer } from './start-test-server'

const server = await startTestServer()
try {
  const page = await fetch(server.url + '/login')
  assert.equal(page.status, 200)
  assert.match(await page.text(), /href="https:\/\/logo\.dev"[^>]*>Logos provided by Logo\.dev<\/a>/)
  const endpoint = server.url + '/api/mobile/merchant-search'
  assert.equal((await fetch(endpoint)).status, 401)
  const response = await fetch(endpoint, { method: 'POST', headers: {
    'content-type': 'application/json', cookie: '__Host-finanzas-session=not-authority'
  }, body: JSON.stringify({ query: 'Synthetic merchant' }) })
  assert.equal(response.status, 401)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  console.log('PASS: compiled merchant route rejects anonymous/cookie requests; attribution is on the public login page.')
} finally { await server.stop() }
