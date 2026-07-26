import { desc } from 'drizzle-orm'
import { db } from '~~/server/db'
import { sprints } from '~~/server/db/schema'

/**
 * Handles GET /api/sprints and returns sprints sorted by newest first.
 * @returns Array of sprint records ordered by created date descending.
 * @throws Propagates database query errors when records cannot be fetched.
 */
export default eventHandler(async () => {
  return db.select().from(sprints).orderBy(desc(sprints.createdAt))
})
