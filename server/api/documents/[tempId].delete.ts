import { createError, eventHandler, getRouterParam } from 'h3'
import { eq, and, isNotNull } from 'drizzle-orm'
import { db } from '~~/server/db'
import { documentChunks, documents } from '~~/server/db/schema'

/**
 * Handles DELETE /api/documents/:tempId to remove a provisional uploaded document.
 * @param event Nitro event containing the route parameter tempId.
 * @returns Idempotent deletion result with ok flag and deleted boolean.
 * @throws {H3Error} Throws a 400 error when tempId is missing.
 */
export default eventHandler(async (event) => {
  const tempId = getRouterParam(event, 'tempId')

  if (!tempId) {
    throw createError({ statusCode: 400, statusMessage: 'tempId is required' })
  }

  // Find the provisional document to delete.
  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.tempId, tempId), isNotNull(documents.tempId))
  })

  if (!doc) {
    // Idempotent - already deleted or never existed.
    return { ok: true, deleted: false }
  }

  // Delete chunks first to respect the foreign key constraint.
  await db.delete(documentChunks).where(eq(documentChunks.documentId, doc.id))
  await db.delete(documents).where(eq(documents.id, doc.id))

  return { ok: true, deleted: true }
})