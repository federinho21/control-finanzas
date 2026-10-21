import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { createApp, createRouter, createError, eventHandler, toNodeListener } from 'h3'
import { createMerchantSearchHandler } from '../server/utils/merchant-search-handler'
import { createLegacyGate } from '../server/middleware/legacy-security'

test('mobile search verifies an ID token, rejects expense data and never accepts a cookie as authority', async t => {
  let calls = 0
  const handler = createMerchantSearchHandler({ verify: async token => {
    if (token !== 'synthetic-id-token') throw Error('Invalid')
    return { uid: 'verified-owner' }
  }, search: async (uid, query) => {
    calls++
    assert.equal(uid, 'verified-owner')
    assert.equal(query, 'Acme')
    return { status: 'ok', merchants: [{ name: 'Acme', domain: 'acme.example' }] }
  } })
  const app = createApp({ debug: false })
  app.use(createLegacyGate(async () => { throw createError({ statusCode: 401 }) }, () => { throw Error('Unexpected browser origin flow') }))
  app.use(createRouter().post('/api/mobile/merchant-search', eventHandler(handler)))
  const server = createServer(toNodeListener(app))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) })
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/mobile/merchant-search`
  const send = (token?: string, body: unknown = { query: 'Acme' }) => fetch(url, { method: 'POST', headers: {
    'content-type': 'application/json', cookie: '__Host-finanzas-session=not-authority',
    ...(token ? { authorization: `Bearer ${token}` } : {})
  }, body: JSON.stringify(body) })
  assert.equal((await send()).status, 401)
  assert.equal((await send('forged')).status, 401)
  assert.equal((await send('synthetic-id-token', { query: 'Acme', amount: 25 })).status, 400)
  assert.equal((await send('synthetic-id-token', { query: 'Acme', userId: 'victim' })).status, 400)
  assert.equal(calls, 0)
  const response = await send('synthetic-id-token')
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { status: 'ok', merchants: [{ name: 'Acme', domain: 'acme.example' }] })
  assert.equal(calls, 1)
  assert.equal((await fetch(url)).status, 401)
})
