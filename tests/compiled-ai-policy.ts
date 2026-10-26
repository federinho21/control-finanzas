import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

export async function assertCompiledAiPolicy(directory: string) {
  const chunks = resolve(directory, 'chunks')
  const files = (await readdir(chunks, { recursive: true })).filter(file => file.endsWith('.mjs'))
  const definitions = (await Promise.all(files.map(async file => ({ file, source: await readFile(resolve(chunks, file), 'utf8') })))).filter(module => /\bfunction useGeminiApiKey\s*\(/.test(module.source))
  assert.equal(definitions.length, 1, 'Expected one compiled Gemini key boundary.')
  const module = pathToFileURL(resolve(chunks, definitions[0]!.file)).href
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict'
    import { Server } from 'node:net'
    import { once } from 'node:events'
    const listen = Server.prototype.listen, servers = new Set()
    Server.prototype.listen = function (...args) {
      servers.add(this)
      return listen.call(this, { host: '127.0.0.1', port: 0 }, args.findLast(value => typeof value === 'function'))
    }
    try {
      const compiled = await import(${JSON.stringify(module)})
      const getter = Object.values(compiled).find(value => typeof value === 'function' && value.name === 'useGeminiApiKey')
      assert.ok(getter, 'Compiled Gemini key boundary must be accessible to the smoke check.')
      assert.throws(getter, error => error.statusCode === 503 && error.data?.message?.includes('IA está desactivada') === true)
    } finally {
      Server.prototype.listen = listen
      await Promise.all([...servers].map(async server => {
        if (!server.listening) await once(server, 'listening')
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
      }))
    }
  `], { encoding: 'utf8', timeout: 10000, killSignal: 'SIGKILL', env: { ...process.env, NODE_OPTIONS: '', NODE_ENV: 'production', FIREBASE_PROJECT_ID: '', FIREBASE_SERVICE_ACCOUNT_JSON: '', GOOGLE_APPLICATION_CREDENTIALS: '', GEMINI_API_KEY: '', NUXT_GEMINI_API_KEY: '' } })
  assert.equal(result.error, undefined, `Compiled AI probe did not exit naturally: ${result.error?.message}\n${result.stderr}`)
  assert.equal(result.status, 0, result.stderr)
}
