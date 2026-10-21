import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export async function assertCompiledAiPolicy(directory: string) {
  const chunks = resolve(directory, 'chunks')
  const files = (await readdir(chunks, { recursive: true })).filter(file => file.endsWith('.mjs'))
  const definitions = (await Promise.all(files.map(async file => ({ file, source: await readFile(resolve(chunks, file), 'utf8') })))).filter(module => /\bfunction useGeminiApiKey\s*\(/.test(module.source))
  assert.equal(definitions.length, 1, 'Expected one compiled Gemini key boundary.')
  const compiled = await import(pathToFileURL(resolve(chunks, definitions[0]!.file)).href)
  const getter = Object.values(compiled).find((value): value is () => string => typeof value === 'function' && value.name === 'useGeminiApiKey')
  assert.ok(getter, 'Compiled Gemini key boundary must be accessible to the smoke check.')
  assert.throws(getter, (error: unknown) => (error as { statusCode?: number }).statusCode === 503 && (error as { data?: { message?: string } }).data?.message?.includes('IA está desactivada') === true)
}
