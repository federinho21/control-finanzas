import { desc, eq } from 'drizzle-orm'
import { db } from '~~/server/db'
import { tasks } from '~~/server/db/schema'

/**
 * Handles GET /api/tasks and returns movement records sorted by newest first.
 * Accepts an optional `mes=YYYY-MM` query param to filter by month.
 * @param event Nitro event with optional mes query parameter.
 * @returns Array of movement records ordered by created date descending.
 * @throws Propagates database query errors when records cannot be fetched.
 */
export default eventHandler(async (event) => {
  const query = getQuery(event)
  const mes = typeof query.mes === 'string' ? query.mes : undefined

  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    const rows = await db.select().from(tasks).orderBy(desc(tasks.deadline))
    return rows.filter((t) => t.deadline.slice(0, 7) === mes)
  }

  return db.select().from(tasks).orderBy(desc(tasks.createdAt))
})
