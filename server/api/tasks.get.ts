import { desc } from 'drizzle-orm'
import { db } from '~~/server/db'
import { tasks } from '~~/server/db/schema'

/**
 * Handles GET /api/tasks and returns tasks sorted by newest first.
 * @returns Array of task records ordered by created date descending.
 * @throws Propagates database query errors when records cannot be fetched.
 */
export default eventHandler(async () => {
  return db.select().from(tasks).orderBy(desc(tasks.createdAt))
})
