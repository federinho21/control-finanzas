import { desc, eq } from 'drizzle-orm'
import { db } from '~~/server/db'
import { documentChunks, documents } from '~~/server/db/schema'
import { cosineSimilarity, embedText } from '~~/server/utils/embeddings'

export async function searchDocuments(query: string, limit = 3) {
  const queryEmbedding = await embedText(query)

  const chunks = await db
    .select()
    .from(documentChunks)
    .orderBy(desc(documentChunks.id))
    .limit(300)

  const scored = chunks
    .map((chunk) => {
      const vector = JSON.parse(chunk.embedding) as number[]
      return {
        ...chunk,
        score: cosineSimilarity(queryEmbedding, vector)
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return scored
}

export async function summarizeDocument(documentId: number) {
  const doc = await db.query.documents.findFirst({ where: eq(documents.id, documentId) })
  if (!doc) {
    throw new Error(`Document ${documentId} not found`)
  }

  return {
    id: doc.id,
    filename: doc.filename,
    excerpt: doc.content.slice(0, 1200)
  }
}
