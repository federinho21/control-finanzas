import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { startTestServer } from './start-test-server'
import { assertCompiledAiPolicy } from './compiled-ai-policy'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

test('compiled probe closes listeners created by an imported server entry', async () => {
  const root = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Temp', 'opencode') : tmpdir()
  const directory = await mkdtemp(join(root, 'finanzas-probe-listener-'))
  await mkdir(join(directory, 'chunks'))
  await writeFile(join(directory, 'chunks', 'entry.mjs'), `
    import { createServer } from 'node:http'
    createServer().listen(0, '127.0.0.1')
    export function useGeminiApiKey() {
      throw Object.assign(new Error('AI disabled'), { statusCode: 503, data: { message: 'IA está desactivada' } })
    }
  `)
  await assertCompiledAiPolicy(directory)
})

test('compiled policy probe does not initialize Nitro in the test runner', async () => {
  const previous = Reflect.get(globalThis, '$fetch')
  await assertCompiledAiPolicy('.output/server')
  assert.equal(Reflect.get(globalThis, '$fetch'), previous)
})

test('fixture shutdown waits for its owned server to close', async t => {
  const server = await startTestServer()
  t.after(() => server.stop())
  const stopped = server.stop()
  assert.ok(stopped instanceof Promise, 'Shutdown must wait for process close, not just send a signal.')
  await stopped
  await assert.rejects(fetch(server.url + '/api/auth/me', { signal: AbortSignal.timeout(1000) }))
})

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
