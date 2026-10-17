import { readFile, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import Database from 'better-sqlite3'
import { applicationDefault, initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { getStorage } from 'firebase-admin/storage'
import { applyMigration, checkMigration, digest, migrationPlan, snapshotSchema } from './migration-model'

const { values } = parseArgs({ options: { sqlite: { type: 'string' }, snapshot: { type: 'string' }, export: { type: 'string' }, uid: { type: 'string' }, project: { type: 'string' }, bucket: { type: 'string' }, apply: { type: 'boolean' }, verify: { type: 'boolean' }, 'confirm-hash': { type: 'string' } } })
if (Boolean(values.sqlite) === Boolean(values.snapshot)) throw new Error('Choose exactly one --sqlite backup.db or --snapshot snapshot.json.')
let source: unknown
if (values.sqlite) {
  const sqlite = new Database(values.sqlite, { readonly: true, fileMustExist: true })
  try { source = sqlite.transaction(() => Object.fromEntries(['rocks', 'sprints', 'tasks', 'cuotas', 'documents', 'document_chunks'].map(table => [table, sqlite.prepare(`SELECT * FROM ${table}`).all()])))() } finally { sqlite.close() }
} else source = JSON.parse(await readFile(values.snapshot!, 'utf8'))
const snapshot = snapshotSchema.parse(source)
if (values.export) await writeFile(values.export, JSON.stringify(snapshot, null, 2), { flag: 'wx', mode: 0o600 })
if (!values.uid) throw new Error('Explicit --uid is required; legacy records have no trustworthy owner.')
const plan = migrationPlan(snapshot, values.uid)
console.log(JSON.stringify({ mode: values.apply ? 'apply' : values.verify ? 'verify' : 'offline-dry-run', uid: plan.uid, records: plan.records.length, files: plan.files.length, hash: plan.hash }))
if (values.apply && values.verify) throw new Error('Choose apply or verify, not both.')
if (values.apply || values.verify) {
  if (!values.project || process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.STORAGE_EMULATOR_HOST) throw new Error('Explicit --project and real credentials required; this operator tool refuses emulator configuration.')
  if (values.apply && values['confirm-hash'] !== plan.hash) throw new Error('--confirm-hash must match the reviewed dry-run hash.')
  if (plan.files.length && !values.bucket) throw new Error('--bucket is required to preserve extracted document text.')
  const app = initializeApp({ projectId: values.project, credential: applicationDefault() }, 'finance-migration')
  const db = getFirestore(app)
  try {
    const user = await getAuth(app).getUser(plan.uid)
    if (user.disabled || !user.providerData.some(provider => provider.providerId === 'google.com')) throw new Error('Owner must be enabled and linked to Google before migration.')
    await checkMigration(db, plan)
    for (const file of plan.files) {
      const object = getStorage(app).bucket(values.bucket).file(file.path)
      const [exists] = await object.exists()
      if (exists) {
        const [bytes] = await object.download()
        if (digest(bytes.toString('utf8')) !== digest(file.text)) throw new Error('Storage destination conflict; no overwrite allowed.')
      } else if (values.apply) await object.save(Buffer.from(file.text), { resumable: false, preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType: 'text/plain; charset=utf-8', cacheControl: 'private, no-store' } })
      else throw new Error('Missing extracted document object.')
    }
    const result = values.apply ? await applyMigration(db, plan) : await checkMigration(db, plan)
    console.log(JSON.stringify(result))
    if (result.missing) throw new Error('Verification failed: migration records are missing.')
  } finally { await db.terminate(); await deleteApp(app) }
}
