import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ssrRenderAttrs } from '@vue/server-renderer'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const editorQuote = createRequire(require.resolve('launch-editor'))('shell-quote')

test('the lockfile excludes vulnerable Git tooling and Nano ID versions', () => {
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))
  for (const [path, entry] of Object.entries(lock.packages) as [string, { version: string }][]) {
    assert.ok(!/node_modules\/(simple-git|@simple-git\/argv-parser)$/.test(path), `Unused Git tooling remains: ${path}`)
    if (/node_modules\/nanoid$/.test(path)) {
      const [major, minor, patch] = entry.version.split('.').map(Number)
      assert.ok(major === 3 && (minor! > 3 || minor === 3 && patch! >= 18) || major === 5 && (minor! > 1 || minor === 1 && patch! >= 16), `Unreviewed Nano ID version: ${entry.version}`)
    }
  }
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
