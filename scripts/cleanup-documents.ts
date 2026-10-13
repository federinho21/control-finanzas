import { parseArgs } from 'node:util'
import { getApps, deleteApp } from 'firebase-admin/app'
import { getFirebaseFirestore } from '../server/firebase/admin'
import { getDocumentRepository } from '../server/repositories/documents'
import { recordId } from '../server/repositories/finance-model'
import { digest } from './migration-model'

const { values } = parseArgs({ options: { uid: { type: 'string' }, project: { type: 'string' }, bucket: { type: 'string' }, apply: { type: 'boolean' }, 'confirm-hash': { type: 'string' } } })
const uid = recordId.parse(values.uid)
if (!values.project || process.env.FIRESTORE_EMULATOR_HOST || process.env.STORAGE_EMULATOR_HOST) throw new Error('Explicit project and real credentials required.')
process.env.FIREBASE_PROJECT_ID = values.project
if (values.bucket) process.env.FIREBASE_STORAGE_BUCKET = values.bucket
const db = getFirebaseFirestore()
try {
  const rows = await db.collection('users').doc(uid).collection('documents').where('userId', '==', uid).limit(101).get()
  if (rows.size > 100) throw new Error('Cleanup exceeds document quota; manual investigation required.')
  const ids = rows.docs.filter(row => { const data = row.data(); return !data.rockId && typeof data.expiresAt === 'number' && data.expiresAt <= Date.now() }).map(row => row.id).sort()
  const hash = digest({ project: values.project, uid, ids })
  console.log(JSON.stringify({ mode: values.apply ? 'apply' : 'dry-run', uid, ids, hash }))
  if (values.apply) {
    if (values['confirm-hash'] !== hash || !values.bucket) throw new Error('Reviewed --confirm-hash and --bucket are required.')
    for (const id of ids) await getDocumentRepository().removeProvisional(uid, id, true)
  }
} finally { await db.terminate(); await Promise.all(getApps().map(app => deleteApp(app))) }
