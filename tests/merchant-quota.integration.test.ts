import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateKeyPairSync } from 'node:crypto'
import { cert, deleteApp, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { startFirestoreEmulator } from './firestore-emulator'
import { reserveMerchantSearch } from '../server/repositories/merchant-search'

test('merchant search quotas are atomic per owner and across the account', { timeout: 60000 }, async () => {
  const emulator = await startFirestoreEmulator()
  const previousHost = process.env.FIRESTORE_EMULATOR_HOST
  process.env.FIRESTORE_EMULATOR_HOST = emulator.host
  const key = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const app = initializeApp({ projectId: 'demo-control-finanzas', credential: cert({
    projectId: 'demo-control-finanzas', clientEmail: 'synthetic@example.invalid', privateKey: key
  }) }, 'merchant-quota-test')
  const db = getFirestore(app)
  try {
    const now = Date.now(), window = Math.floor(now / 60000), account = db.doc('systemLogoDev/search')
    const owner = 'merchant-quota-owner', ids = [owner, 'merchant-quota-one', 'merchant-quota-two']
    for (let i = 0; i < 19; i++) await reserveMerchantSearch(owner, db, now)
    const attempts = await Promise.allSettled([reserveMerchantSearch(owner, db, now), reserveMerchantSearch(owner, db, now)])
    assert.equal(attempts.filter(row => row.status === 'fulfilled').length, 1)
    assert.equal((await db.doc(`users/${owner}/internal/logoSearchLimit`).get()).data()?.count, 20)
    await account.set({ window, count: 99 })
    const shared = await Promise.allSettled([reserveMerchantSearch(ids[1]!, db, now), reserveMerchantSearch(ids[2]!, db, now)])
    assert.equal(shared.filter(row => row.status === 'fulfilled').length, 1)
    assert.equal((await account.get()).data()?.count, 100)
    await account.set({ blockedUntil: now + 60000 }, { merge: true })
    await assert.rejects(reserveMerchantSearch(owner, db, now), (error: unknown) => (error as { statusCode: number }).statusCode === 429)
  } finally {
    await db.terminate()
    await deleteApp(app)
    await emulator.stop()
    if (previousHost === undefined) delete process.env.FIRESTORE_EMULATOR_HOST
    else process.env.FIRESTORE_EMULATOR_HOST = previousHost
  }
})
