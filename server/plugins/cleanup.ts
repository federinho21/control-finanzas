import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { db, initDatabase } from '~~/server/db'
import { documentChunks, documents } from '~~/server/db/schema'

/**
 * Deletes orphaned provisional documents from storage.
 *
 * An orphaned document is a row with a `tempId` (uploaded provisionally during
 * chat) and no `rockId` (never linked to a rock because the plan was rejected,
 * abandoned, or the server crashed before approval).
 *
 * This function finds those documents, deletes related `documentChunks` first
 * to respect foreign key constraints, and then deletes the parent `documents`
 * rows.
 *
 * @returns {Promise<void>} Resolves when cleanup is complete; no-op if no
 * orphaned documents exist.
 */
async function deleteOrphanedDocuments() {
  const orphans = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(isNotNull(documents.tempId), isNull(documents.rockId)))

  if (orphans.length === 0) {
    return
  }

  for (const doc of orphans) {
    await db.delete(documentChunks).where(eq(documentChunks.documentId, doc.id))
  }

  await db.delete(documents).where(and(isNotNull(documents.tempId), isNull(documents.rockId)))
}

export default defineNitroPlugin(async (nitroApp) => {
  // Initialize the DB connection (D1 on Workers, better-sqlite3 locally) before queries.
  await initDatabase()

  // Clean up orphans left by crashes or abandoned sessions from previous runs.
  await deleteOrphanedDocuments()

  // Clean up orphans created during this server session on graceful shutdown.
  nitroApp.hooks.hook('close', async () => {
    await deleteOrphanedDocuments()
  })
})