import type { Firestore } from 'firebase-admin/firestore'
import { FinanceError, recordId } from './finance-model'
import { getDocumentBucket, getFirebaseFirestore } from '../firebase/admin'
import { chunkText } from '../utils/chunker'
import { cosineSimilarity, embedText } from '../utils/embeddings'
import { extractTextFromFile, validateFile } from '../utils/pdf-parser'

export interface DocumentFiles {
  save(path: string, bytes: Buffer, mime: string): Promise<void>
  remove(path: string): Promise<void>
}
export class DocumentRepository {
  constructor(private db: Firestore, private files: DocumentFiles, private embed: (text: string) => Promise<number[]> = embedText) {}
  private collection(uid: string, name: 'documents' | 'documentChunks') { recordId.parse(uid); return this.db.collection('users').doc(uid).collection(name) }
  private path(uid: string, id: string, name: 'original' | 'extracted.txt') { recordId.parse(uid); recordId.parse(id); return `users/${uid}/documents/${id}/${name}` }
  async ingest(uid: string, file: { filename: string; mime: string; bytes: Buffer }) {
    validateFile(file.bytes, file.filename, file.mime)
    const text = await extractTextFromFile(file.bytes, file.filename)
    if (!text.trim() || text.length > 150000) throw new FinanceError(413, 'Readable text must be nonempty and under 150,000 characters.')
    const chunks = await chunkText(text)
    if (!chunks.length || chunks.length > 150) throw new FinanceError(413, 'Document exceeds the 150-chunk limit.')
    const id = crypto.randomUUID()
    const ref = this.collection(uid, 'documents').doc(id)
    await this.db.runTransaction(async tx => {
      const existing = await tx.get(this.collection(uid, 'documents').where('userId', '==', uid).limit(101))
      if (existing.size >= 100) throw new FinanceError(413, 'Document quota reached.')
      tx.create(ref, { id, userId: uid, filename: file.filename, status: 'processing', rockId: null, tempId: id, createdAt: new Date().toISOString(), expiresAt: Date.now() + 86400000 })
    })
    try {
      await this.files.save(this.path(uid, id, 'original'), file.bytes, file.mime)
      await this.files.save(this.path(uid, id, 'extracted.txt'), Buffer.from(text), 'text/plain; charset=utf-8')
      const vectors: number[][] = []
      for (const chunk of chunks) {
        const vector = await this.embed(chunk)
        if (!vector.length || vector.length > 3072 || vector.some(value => !Number.isFinite(value))) throw new FinanceError(422, 'Invalid embedding vector.')
        if (vectors.length && vector.length !== vectors[0]!.length) throw new FinanceError(422, 'Inconsistent embedding dimensions.')
        vectors.push(vector)
      }
      const batch = this.db.batch()
      for (let index = 0; index < chunks.length; index++) batch.create(this.collection(uid, 'documentChunks').doc(`${id}_${index}`), { userId: uid, documentId: id, chunkText: chunks[index], embedding: vectors[index], status: 'ready', createdAt: new Date().toISOString() })
      batch.update(ref, { status: 'ready', chunkCount: chunks.length, excerpt: text.slice(0, 1200) })
      await batch.commit()
      return { ok: true, filename: file.filename, documentId: id, tempId: id, chunks: chunks.length }
    } catch (error) {
      await ref.update({ status: 'failed' }).catch(() => {})
      await Promise.allSettled(['original', 'extracted.txt'].map(name => this.files.remove(this.path(uid, id, name as 'original' | 'extracted.txt'))))
      throw error
    }
  }
  async removeProvisional(uid: string, id: string, expiredOnly = false) {
    recordId.parse(id)
    const ref = this.collection(uid, 'documents').doc(id)
    await this.db.runTransaction(async tx => {
      const row = await tx.get(ref), data = row.data()
      if (!data || data.userId !== uid) throw new FinanceError(404, 'Document not found.')
      if (data.rockId) throw new FinanceError(409, 'Linked documents cannot be canceled.')
      if (expiredOnly && (typeof data.expiresAt !== 'number' || data.expiresAt > Date.now())) throw new FinanceError(409, 'Document is not expired.')
      if (data.status === 'processing' && data.expiresAt > Date.now()) throw new FinanceError(409, 'Document processing is still active.')
      tx.update(ref, { status: 'deleting' })
    })
    await Promise.all([this.files.remove(this.path(uid, id, 'original')), this.files.remove(this.path(uid, id, 'extracted.txt'))])
    const chunks = await this.collection(uid, 'documentChunks').where('userId', '==', uid).where('documentId', '==', id).limit(151).get()
    if (chunks.size > 150) throw new FinanceError(413, 'Document exceeds the deletion limit.')
    const batch = this.db.batch()
    for (const row of chunks.docs) batch.delete(row.ref)
    batch.delete(ref)
    await batch.commit()
    return { ok: true }
  }
  async search(uid: string, query: string, limit = 3) {
    // shortcut: searches the latest 300 chunks; use Firestore vector indexes for larger libraries.
    const rows = await this.collection(uid, 'documentChunks').where('userId', '==', uid).where('status', '==', 'ready').orderBy('createdAt', 'desc').limit(300).get()
    const candidates: Array<{ documentId: string; chunkText: string; embedding: number[] }> = []
    const eligible = new Map<string, boolean>()
    const ids = [...new Set(rows.docs.map(row => row.data().documentId).filter(id => recordId.safeParse(id).success))]
    if (ids.length) for (const row of await this.db.getAll(...ids.map(id => this.collection(uid, 'documents').doc(id)))) {
      const meta = row.data()
      eligible.set(row.id, !!meta && meta.userId === uid && meta.status === 'ready' && !!(meta.rockId || meta.expiresAt > Date.now()))
    }
    for (const row of rows.docs) {
      const data = row.data()
      if (!recordId.safeParse(data.documentId).success || typeof data.chunkText !== 'string' || data.chunkText.length > 1600 || !Array.isArray(data.embedding) || data.embedding.length > 3072 || data.embedding.some((value: unknown) => typeof value !== 'number' || !Number.isFinite(value))) continue
      if (eligible.get(data.documentId)) candidates.push({ documentId: data.documentId, chunkText: data.chunkText, embedding: data.embedding })
    }
    if (!candidates.length) return []
    const vector = await this.embed(query)
    if (!vector.length || vector.length > 3072 || vector.some(value => !Number.isFinite(value))) throw new FinanceError(422, 'Invalid query vector.')
    return candidates.filter(row => row.embedding.length === vector.length).map(row => ({ documentId: row.documentId, chunkText: row.chunkText, score: cosineSimilarity(vector, row.embedding) })).sort((a, b) => b.score - a.score).slice(0, Math.min(Math.max(limit, 1), 5))
  }
  async summary(uid: string, id: string) {
    recordId.parse(id)
    const data = (await this.collection(uid, 'documents').doc(id).get()).data()
    if (!data || data.userId !== uid || data.status !== 'ready' || (!data.rockId && data.expiresAt <= Date.now())) throw new FinanceError(404, 'Document not found.')
    return { filename: data.filename, excerpt: data.excerpt }
  }
}
export function getDocumentRepository() {
  const db = getFirebaseFirestore()
  return new DocumentRepository(db, {
    save: async (path, bytes, mime) => { await getDocumentBucket().file(path).save(bytes, { resumable: false, metadata: { contentType: mime, cacheControl: 'private, no-store' } }) },
    remove: async path => { await getDocumentBucket().file(path).delete({ ignoreNotFound: true }) }
  })
}
