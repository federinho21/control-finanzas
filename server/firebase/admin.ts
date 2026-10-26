import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { z } from 'zod'

const credentialInput = z.object({ type: z.literal('service_account'), project_id: z.string().min(6).max(30), client_email: z.email().max(254), private_key: z.string().min(64).max(20000) })

function getFirebaseApp() {
  if (process.env.DEPLOY_TARGET === 'cloudflare') {
    throw new Error('Firebase Admin requires the Node deployment target.')
  }
  const projectId = process.env.FIREBASE_PROJECT_ID
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID is required.')
  if (process.env.NODE_ENV === 'production' && process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('Authentication emulator is forbidden in production.')
  }
  if (process.env.NODE_ENV === 'production' && process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('Firestore emulator is forbidden in production.')
  }
  let credential
  const serialized = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (serialized !== undefined) {
    try {
      if (serialized.length > 30000) throw new Error('Too large')
      const input = credentialInput.parse(JSON.parse(serialized))
      if (input.project_id !== projectId) throw new Error('Project mismatch')
      credential = cert({ projectId: input.project_id, clientEmail: input.client_email, privateKey: input.private_key })
    } catch { throw new Error('Invalid Firebase server credentials.') }
  }
  const existing = getApps().find(app => app.name === 'control-finanzas')
  const app = existing ?? initializeApp({ projectId, credential: credential ?? applicationDefault() }, 'control-finanzas')
  return app
}

export function getFirebaseAuth() { return getAuth(getFirebaseApp()) }
export function getFirebaseFirestore() { return getFirestore(getFirebaseApp()) }
export function getDocumentBucket() {
  const name = process.env.FIREBASE_STORAGE_BUCKET
  if (!name) throw new Error('FIREBASE_STORAGE_BUCKET is required.')
  if (process.env.NODE_ENV === 'production' && process.env.STORAGE_EMULATOR_HOST) throw new Error('Storage emulator is forbidden in production.')
  return getStorage(getFirebaseApp()).bucket(name)
}
