import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createMerchantSearch } from '../server/utils/merchant-search'

test('no secret means no network, no quota consumption and a working disabled response', async () => {
  const service = createMerchantSearch({ secret: () => undefined, reserve: async () => { throw Error('Unexpected quota') },
    block: async () => {}, fetch: async () => { throw Error('Unexpected network') } })
  assert.deepEqual(await service.search('owner', 'Tienda'), { status: 'disabled', merchants: [] })
})

test('search sends only name, typeahead and limit; validates candidates and caches per owner', async () => {
  let calls = 0
  const service = createMerchantSearch({ secret: () => 'sk_synthetic', reserve: async () => {}, block: async () => {},
    fetch: async (url, init) => {
      calls++
      const parsed = new URL(String(url))
      assert.equal(parsed.origin + parsed.pathname, 'https://api.logo.dev/v2/search')
      assert.deepEqual([...parsed.searchParams.keys()].sort(), ['limit', 'method', 'q'])
      assert.equal(parsed.searchParams.get('q'), 'Acme')
      assert.equal(parsed.searchParams.get('method'), 'typeahead')
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer sk_synthetic')
      assert.equal(init?.redirect, 'error')
      return Response.json({ data: [
        { name: 'Acme One', domain: 'acme.example', logo_url: 'https://evil.invalid/private' },
        { name: 'Acme Two', domain: 'different.example', logo_url: 'https://img.logo.dev/different.example' },
        { name: 'Invalid', domain: 'https://evil.invalid/path' },
        { name: 'Invalid', domain: '127.0.0.1' }
      ] })
    } })
  const result = await service.search('owner', 'Acme')
  assert.deepEqual(result, { status: 'ok', merchants: [{ name: 'Acme One', domain: 'acme.example' }, { name: 'Acme Two', domain: 'different.example' }] })
  assert.deepEqual(await service.search('owner', 'Acme'), result)
  assert.equal(calls, 1)
  await service.search('other-owner', 'Acme')
  assert.equal(calls, 2)
})

test('limits, empty results and malformed upstream data never return a guessed identity', async () => {
  let blocked = 0
  const limited = createMerchantSearch({ secret: () => 'sk_synthetic', reserve: async () => {}, block: async seconds => { blocked = seconds },
    fetch: async () => new Response('', { status: 429, headers: { 'RateLimit-Reset': '42' } }) })
  assert.deepEqual(await limited.search('owner', 'Acme'), { status: 'limited', merchants: [], retryAfterSeconds: 42 })
  assert.equal(blocked, 42)
  const missing = createMerchantSearch({ secret: () => 'sk_synthetic', reserve: async () => {}, block: async () => {}, fetch: async () => Response.json({ data: [] }) })
  assert.deepEqual(await missing.search('owner', 'Unknown'), { status: 'ok', merchants: [] })
  const broken = createMerchantSearch({ secret: () => 'sk_synthetic', reserve: async () => {}, block: async () => {}, fetch: async () => Response.json({ data: 'wrong' }) })
  assert.deepEqual(await broken.search('owner', 'Acme'), { status: 'unavailable', merchants: [] })
  await assert.rejects(missing.search('owner', 'ab'))
})
