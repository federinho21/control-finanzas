import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

test('compiled auth checks consume every response body before shutdown', async t => {
  const responses: Response[] = []
  const request = globalThis.fetch
  t.mock.method(globalThis, 'fetch', async (...args: Parameters<typeof fetch>) => {
    const response = await request(...args)
    responses.push(response)
    return response
  })
  t.after(async () => { await Promise.all(responses.filter(response => !response.bodyUsed).map(response => response.arrayBuffer())) })
  await import('./auth-build.smoke')
  assert.ok(responses.length > 0)
  assert.ok(responses.every(response => response.bodyUsed), 'Status/header probes must also consume their response bodies.')
})

test('compiled auth smoke drains its HTTP responses and exits naturally', () => {
  const result = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'tests/auth-build.smoke.ts'], {
    encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024
  })
  assert.equal(result.error, undefined, `Smoke did not finish naturally: ${result.error?.message}\n${result.stdout}\n${result.stderr}`)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /PASS: compiled AI refusal and 15 Nitro/)
})
