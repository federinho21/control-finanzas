import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ssrRenderAttrs } from '@vue/server-renderer'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { parse, stringify } from 'devalue'
import MarkdownIt from 'markdown-it'
import { mergeAttributes } from '@tiptap/core'

const require = createRequire(import.meta.url)
const editorQuote = createRequire(require.resolve('launch-editor'))('shell-quote')

test('the lockfile excludes vulnerable Git tooling and Nano ID versions', () => {
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))
  const satisfies = require('semver').satisfies as (version: string, range: string) => boolean
  for (const [path, entry] of Object.entries(lock.packages) as [string, { version: string }][]) {
    assert.ok(!/node_modules\/(simple-git|@simple-git\/argv-parser)$/.test(path), `Unused Git tooling remains: ${path}`)
    if (/node_modules\/nanoid$/.test(path)) {
      assert.ok(satisfies(entry.version, '^3.3.18 || ^5.1.16'), `Unreviewed Nano ID version: ${entry.version}`)
    }
  }
})

test('Nuxt buffer serialization does not expose unrelated pooled bytes', () => {
  const source = Buffer.allocUnsafe(64)
  source.fill(120)
  const visible = source.subarray(10, 13)
  const restored = parse(stringify(visible)) as Uint8Array
  assert.deepEqual([...restored], [120, 120, 120])
  assert.equal(restored.buffer.byteLength, 3)
})

test('runtime and build lockfile entries contain the reviewed security patches', () => {
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))
  const satisfies = require('semver').satisfies as (version: string, range: string) => boolean
  for (const [path, entry] of Object.entries(lock.packages) as [string, { version: string }][]) {
    for (const [name, range] of Object.entries({
      undici: '^8.10.2', devalue: '^5.9.3', 'markdown-it': '^14.3.3', 'linkify-it': '^5.0.2',
      'source-map-js': '^1.2.2', svgo: '^4.1.0', 'prosemirror-view': '^1.42.3', 'brace-expansion': '^2.1.7 || ^5.0.12',
      seroval: '^1.6.3', langsmith: '>=0.6.0 <1.0.0', '@tiptap/core': '^3.30.5',
      'fast-copy': '^4.1.0', 'postcss-selector-parser': '^7.1.6', '@nuxt/ui': '>=4.8.1 <5', '@grpc/grpc-js': '^1.14.6',
      'launch-editor': '^2.14.2', vite: '>=8.2.4 <8.3.0 || ^8.3.3', uuid: '^11.1.1 || ^12.0.1 || ^13.0.1 || >=14', esbuild: '^0.28.2'
    })) {
      if (path.endsWith(`node_modules/${name}`)) assert.ok(satisfies(entry.version, range), `${path}: ${entry.version}`)
    }
  }
})

test('patched esbuild transforms and bundles through each installed build-tool caller', () => {
  for (const caller of ['fontless', '@esbuild-kit/core-utils', 'nitropack', 'drizzle-kit', 'tsx', '@nuxt/fonts']) {
    const esbuild = createRequire(import.meta.resolve(caller))('esbuild')
    const transformed = esbuild.transformSync('export const amount: number = 123', { loader: 'ts', format: 'esm' })
    assert.ok(transformed.code.includes('123'), caller)
    assert.ok(!transformed.code.includes(': number'), caller)
    const bundled = esbuild.buildSync({ stdin: { contents: 'export const amount: number = 123', loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node' })
    assert.ok(bundled.outputFiles[0].text.includes('123'), caller)
  }
})

test('Firestore-resolved gRPC does not expose thrown server errors to clients', async () => {
  const grpc = createRequire(require.resolve('@firebase/firestore'))('@grpc/grpc-js')
  const serialize = (value: string) => Buffer.from(value)
  const deserialize = (value: Buffer) => value.toString()
  const server = new grpc.Server()
  let client: { close(): void } | undefined
  try {
    server.addService({ crash: { path: '/security/Crash', requestStream: false, responseStream: false, requestSerialize: serialize, requestDeserialize: deserialize, responseSerialize: serialize, responseDeserialize: deserialize } }, {
      crash() { throw new Error('synthetic-private-server-detail') }
    })
    const port = await new Promise<number>((resolve, reject) => server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (error: Error | null, port: number) => error ? reject(error) : resolve(port)))
    server.start()
    const connection = new grpc.Client(`127.0.0.1:${port}`, grpc.credentials.createInsecure())
    client = connection
    const error = await new Promise<{ code: number; details: string }>((resolve, reject) => {
      connection.makeUnaryRequest('/security/Crash', serialize, deserialize, 'synthetic', { deadline: Date.now() + 5000 }, (error: { code: number; details: string } | null) => error ? resolve(error) : reject(new Error('Expected failed RPC')))
    })
    assert.equal(error.code, grpc.status.UNKNOWN)
    assert.ok(!error.details.includes('synthetic-private-server-detail'), 'Thrown server details must not reach RPC clients')
  } finally {
    client?.close()
    server.forceShutdown()
  }
})

test('the installed Nuxt UI template defaults top-level forms to POST before hydration', () => {
  const form = readFileSync(new URL('../node_modules/@nuxt/ui/dist/runtime/components/Form.vue', import.meta.url), 'utf8')
  assert.ok(form.includes(':method="parentBus ? void 0 : \'post\'"'))
})

test('the UI editor dependency cannot inherit executable attributes through an own prototype key', () => {
  const attrs = mergeAttributes(JSON.parse('{"__proto__":{"onclick":"untrusted"},"title":"Safe"}'))
  assert.equal(attrs.onclick, undefined)
  assert.equal(attrs.title, 'Safe')
  assert.equal(Object.getPrototypeOf(attrs), Object.prototype)
})

test('the installed agent provider still invokes Gemini through the patched tracing dependency', async () => {
  const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai')
  const originalFetch = globalThis.fetch
  let requests = 0
  globalThis.fetch = async (input, options) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
    assert.equal(url.hostname, 'generativelanguage.googleapis.com')
    assert.match(url.pathname, /gemini-3\.1-flash-lite:generateContent$/)
    const body = JSON.parse(String(options?.body))
    assert.equal(body.generationConfig.maxOutputTokens, 30)
    requests++
    return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'READY' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } }), { headers: { 'content-type': 'application/json' } })
  }
  try {
    const model = new ChatGoogleGenerativeAI({ apiKey: 'synthetic-no-network-key', model: 'gemini-3.1-flash-lite', temperature: 0, maxRetries: 0, maxOutputTokens: 30 })
    const result = await model.invoke('Synthetic connectivity check. Reply only READY.', { signal: AbortSignal.timeout(6000) })
    assert.equal(result.content, 'READY')
    assert.equal(requests, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('chat markdown still escapes HTML, rejects executable links and renders financial text', () => {
  const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false })
  const rendered = markdown.render('**Importe:** ₡25.00 CRC\n\n<script>alert(1)</script>\n\n[abrir](javascript:alert(1))\n\nhttps://example.invalid')
  assert.ok(rendered.includes('<strong>Importe:</strong> ₡25.00 CRC'))
  assert.ok(rendered.includes('&lt;script&gt;'))
  assert.ok(!rendered.includes('<script>'))
  assert.ok(!rendered.includes('<a '))
})

test('markdown handles bounded unclosed multiline references and preserves valid links', () => {
  const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false })
  for (const source of ['[a]: /u "' + 'x\n'.repeat(2000), '[' + 'a\n'.repeat(2000)]) {
    const output = markdown.render(source)
    assert.ok(output.startsWith('<p>['))
    assert.ok(!output.includes('<a '))
  }
  assert.equal(markdown.render('[a]: https://example.invalid "Safe"\n\n[a]'), '<p><a href="https://example.invalid" title="Safe">a</a></p>\n')
})

test('Vue SSR rejects carriage-return attribute names instead of injecting event handlers', () => {
  const output = ssrRenderAttrs({ 'x\rautofocus\ronfocus': 'alert(document.cookie)', title: 'Safe attribute' })
  assert.equal(output, ' title="Safe attribute"')
})

test('Vue SSR continues escaping ordinary untrusted attribute values', () => {
  const output = ssrRenderAttrs({ title: '\"><script>alert(1)</script>' })
  assert.ok(!output.includes('<script>'))
  assert.ok(output.includes('&quot;&gt;&lt;script&gt;'))
})

test('editor shell quoting rejects line terminators after comment tokens without executing commands', () => {
  for (const terminator of ['\n', '\r', '\u2028', '\u2029']) {
    assert.throws(() => editorQuote.quote(['echo', 'ok', { comment: 'x' }, `a${terminator}unexpected-command;#`]), TypeError)
  }
})

test('editor shell quoting preserves ordinary paths, quotes and metacharacters as arguments', () => {
  const args = ['code', 'C:\\Users\\Fede\\Finance notes.txt', "Fede's file", 'a;b', '$(not-run)', '']
  assert.deepEqual(editorQuote.parse(editorQuote.quote(args)), args)
})

test('Windows editor command construction rejects expansion and line breaks without launching anything', () => {
  const command = require('launch-editor/construct-windows-launch-command')
  for (const file of ['C:\\synthetic\\%PATH%.vue', 'C:\\synthetic\\a\nb.vue', 'C:\\synthetic\\a\rb.vue']) {
    assert.throws(() => command('code', [file]), Error)
  }
  assert.equal(command('code', ['C:\\synthetic\\Finance notes.vue']), 'code "C:\\synthetic\\Finance notes.vue"')
})

test('editor paths become absolute before existence checks and cannot become relative CLI flags', () => {
  const parseFile = require('launch-editor/parse-file')
  const args = require('launch-editor/get-args')
  const parsed = parseFile('+synthetic.vue:12:3')
  assert.equal(parsed.fileName, resolve('+synthetic.vue'))
  assert.equal(parsed.lineNumber, '12')
  assert.equal(parsed.columnNumber, '3')
  assert.ok(isAbsolute(args('vim', '+synthetic.vue')[0]))
  assert.equal(parseFile('missing/..:1:1').fileName, resolve('missing/..'))
})
