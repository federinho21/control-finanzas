import { getFirebaseFirestore } from '../firebase/admin'
import { FinanceError, recordId } from './finance-model'
import type { Firestore } from 'firebase-admin/firestore'

export async function reserveMerchantSearch(uid: string, db: Firestore = getFirebaseFirestore(), now = Date.now()) {
  recordId.parse(uid)
  const window = Math.floor(now / 60000)
  const owner = db.doc(`users/${uid}/internal/logoSearchLimit`), account = db.doc('systemLogoDev/search')
  await db.runTransaction(async transaction => {
    const [userRow, globalRow] = await Promise.all([transaction.get(owner), transaction.get(account)])
    if ((globalRow.data()?.blockedUntil ?? 0) > now) throw new FinanceError(429, 'Search temporarily limited.')
    const counts = [userRow, globalRow].map(row => row.data()?.window === window ? row.data()?.count : 0)
    if (counts.some(count => !Number.isSafeInteger(count) || count < 0)) throw new FinanceError(503, 'Search limit unavailable.')
    if (counts[0] >= 20 || counts[1] >= 100) throw new FinanceError(429, 'Search temporarily limited.')
    transaction.set(owner, { userId: uid, window, count: counts[0] + 1 })
    transaction.set(account, { window, count: counts[1] + 1 }, { merge: true })
  })
}

export async function blockMerchantSearch(seconds: number) {
  await getFirebaseFirestore().doc('systemLogoDev/search').set({ blockedUntil: Date.now() + seconds * 1000 }, { merge: true })
}
