import { desc } from 'drizzle-orm'
import { db } from '~~/server/db'
import { rocks } from '~~/server/db/schema'

/**
 * Handles GET /api/rocks and returns rocks sorted by newest first.
 * @returns Array of rock records ordered by created date descending.
 * @throws Propagates database query errors when records cannot be fetched.
 */
export default eventHandler(async () => {
  return db.select().from(rocks).orderBy(desc(rocks.createdAt))
})
