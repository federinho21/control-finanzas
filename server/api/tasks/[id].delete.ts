import { createError, eventHandler } from 'h3'
import { db } from '~~/server/db'
import { tasks } from '~~/server/db/schema'
import { eq } from 'drizzle-orm'

/**
 * Handles DELETE /api/tasks/:id to remove a movement record.
 * @param event Nitro event containing the task id route param.
 * @returns The deletion result.
 * @throws {H3Error} Throws 404 when the task does not exist.
 */
export default eventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Task ID is required.' })
  }

  const deleted = await db.delete(tasks).where(eq(tasks.id, id)).returning()
  if (!deleted.length) {
    throw createError({ statusCode: 404, message: 'Task not found.' })
  }

  return { ok: true }
})
