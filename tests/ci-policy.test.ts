import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parse } from 'yaml'

interface Step { uses?: string; run?: string; if?: string; with?: Record<string, unknown>; 'continue-on-error'?: boolean }
interface Job { steps: Step[]; 'runs-on': string; 'timeout-minutes': number; permissions?: unknown; if?: string; env?: Record<string, string> }
const source = readFileSync(new URL('../.github/workflows/quality.yml', import.meta.url), 'utf8')
const workflow = parse(source) as { on: { push: { branches: string[] }; pull_request: { branches: string[] } }; permissions: Record<string, string>; jobs: Record<string, Job> }

test('CI is read-only, secret-free and never deploys or suppresses check failures', () => {
  assert.deepEqual(workflow.permissions, { contents: 'read' })
  assert.deepEqual(workflow.on.push.branches, ['main', 'prepare/firebase-netlify'])
  assert.deepEqual(workflow.on.pull_request.branches, ['main'])
  assert.ok(source.includes('github.event.pull_request.head.repo.full_name || github.repository'))
  assert.doesNotMatch(source, /pull_request_target|secrets\.|id-token:|npm audit fix|--force|npm run deploy|firebase deploy|netlify deploy|migrate:firestore|\|\| true|set \+e/)
  for (const job of Object.values(workflow.jobs)) {
    assert.equal(job['runs-on'], 'ubuntu-24.04')
    assert.ok(job['timeout-minutes'] > 0 && job['timeout-minutes'] <= 20)
    assert.equal(job.permissions, undefined)
    assert.equal(job.if, undefined)
    for (const value of Object.values(job.env ?? {})) assert.doesNotMatch(value, /\$\{\{\s*runner\./)
    for (const step of job.steps) {
      assert.notEqual(step['continue-on-error'], true)
      if (step.uses) assert.match(step.uses, /^actions\/[a-z-]+@[a-f0-9]{40}$/)
      if (step.run) assert.equal(step.if, undefined)
      if (step.uses?.startsWith('actions/checkout@')) assert.equal(step.with?.['persist-credentials'], false)
    }
  }
})

test('CI retains every existing verification suite and a failing high-severity audit', () => {
  const verification = workflow.jobs.verify!.steps.map(step => step.run ?? '').join('\n')
  for (const script of ['test:ci', 'typecheck:auth', 'typecheck:finance', 'typecheck:auth:web', 'test:auth', 'test:auth:web', 'test:finance:model', 'test:migration', 'test:chat:behavior', 'test:security:dependencies', 'test:netlify', 'test:finance', 'build:test', 'test:auth:build', 'test:auth:browser', 'build:netlify', 'test:netlify:build']) {
    assert.ok(verification.split('\n').includes(`npm run ${script}`), script)
  }
  for (const job of Object.values(workflow.jobs)) {
    const commands = job.steps.map(step => step.run ?? '').join('\n')
    assert.ok(commands.includes('npm ci --include=dev --ignore-scripts --no-audit'))
    assert.ok(commands.includes('11.16.0'))
    assert.ok(job.steps.some(step => step.uses?.startsWith('actions/setup-node@') && step.with?.['node-version'] === '24.18.0'))
  }
  const audit = workflow.jobs['dependency-audit']!.steps.map(step => step.run ?? '').join('\n')
  assert.ok(audit.includes('npm audit --omit=dev --audit-level=high --json'))
})

test('CI verifies the emulator before running it and keeps browser execution isolated', () => {
  const steps = workflow.jobs.verify!.steps
  const verified = steps.findIndex(step => step.run?.includes('sha256sum --check --strict'))
  const integration = steps.findIndex(step => step.run === 'npm run test:finance')
  assert.ok(verified >= 0 && integration > verified)
  assert.ok(source.includes('https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.22.0.jar'))
  assert.ok(source.includes('9b6498b7f62714d67f48f59b3818883cd682dbcd46b9f59511de81c97bb5166c'))
  assert.ok(source.includes('sha256sum --check --strict'))
  assert.ok(source.includes('TMPDIR=%s\\n'))
  assert.ok(source.includes('"$RUNNER_TEMP" >> "$GITHUB_ENV"'))
  assert.ok(source.includes('playwright install --with-deps chromium'))
  assert.ok(source.includes('npm run postinstall -- --dotenv tests/fixtures/build.env'))
  for (const job of Object.values(workflow.jobs)) {
    for (const step of job.steps.filter(step => step.uses?.startsWith('actions/upload-artifact@'))) assert.equal(step.with?.['retention-days'], 7)
  }
})

test('scoped typechecks use the public Nuxt directory prepared on a clean checkout', () => {
  for (const [file, generated] of [['tsconfig.finance.json', 'server'], ['tsconfig.web.json', 'app']]) {
    const contents = readFileSync(new URL(file!, import.meta.url), 'utf8')
    assert.equal(JSON.parse(contents).extends, `../.nuxt/tsconfig.${generated}.json`)
    assert.ok(!contents.includes('node_modules/.cache/nuxt'))
  }
  const web = JSON.parse(readFileSync(new URL('tsconfig.web.json', import.meta.url), 'utf8')) as { include: string[] }
  for (const form of ['FinancePanel', 'MovimientoForm', 'CuotaForm']) assert.ok(web.include.includes(`../app/components/finanzas/${form}.vue`), form)
})
