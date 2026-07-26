import { eq } from 'drizzle-orm'
import { db } from '~~/server/db'
import { sprints, tasks } from '~~/server/db/schema'
import type { Sprint } from '~~/shared/types/sprint'

const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'on_hold'] as const
type TaskStatus = typeof VALID_STATUSES[number]

/**
 * Derives sprint status from the statuses of tasks assigned to that sprint.
 * @param sprintTasks Sprint task list with status values.
 * @returns Derived sprint status used to keep sprint progress in sync.
 * @throws Does not throw; empty and mixed states are handled deterministically.
 */
function deriveSprintStatus(sprintTasks: { status: string }[]): Sprint['status'] {
  if (sprintTasks.length === 0) return 'planned'
  const statuses = sprintTasks.map(t => t.status)
  if (statuses.every(s => s === 'completed')) return 'completed'
  if (statuses.some(s => s === 'in_progress')) return 'in_progress'
  if (statuses.every(s => s === 'on_hold')) return 'on_hold'
  if (statuses.every(s => s === 'pending')) return 'planned'
  return 'in_progress'
}

/**
 * Handles PATCH /api/tasks/:id to update task status and recalculate sprint status.
 * @param event Nitro event containing task id route param and body with new status.
 * @returns Updated task payload plus optional new sprint status.
 * @throws {H3Error} Throws 400/404/422 errors for invalid input, missing task, or immutable completed tasks.
 */
export default eventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Task ID is required.' })
  }

  const body = await readBody<{ status?: string }>(event)
  if (!body.status || !VALID_STATUSES.includes(body.status as TaskStatus)) {
    throw createError({ statusCode: 400, message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}.` })
  }

  const existing = await db.query.tasks.findFirst({ where: eq(tasks.id, id) })
  if (!existing) {
    throw createError({ statusCode: 404, message: 'Task not found.' })
  }

  if (existing.status === 'completed') {
    throw createError({ statusCode: 422, statusMessage: 'Task is already completed and cannot be changed.' })
  }

  const updated = await db
    .update(tasks)
    .set({ status: body.status as TaskStatus })
    .where(eq(tasks.id, id))
    .returning()

  if (!updated.length) {
    throw createError({ statusCode: 404, message: 'Task not found.' })
  }

  const updatedTask = updated[0]!

  // Recalculate sprint status from all tasks in the sprint.
  let newSprintStatus: Sprint['status'] | null = null
  if (updatedTask.sprintId) {
    const sprintTasks = await db.query.tasks.findMany({ where: eq(tasks.sprintId, updatedTask.sprintId) })
    const derived = deriveSprintStatus(sprintTasks)
    const sprint = await db.query.sprints.findFirst({ where: eq(sprints.id, updatedTask.sprintId) })
    if (sprint && sprint.status !== derived) {
      await db.update(sprints).set({ status: derived }).where(eq(sprints.id, updatedTask.sprintId))
      newSprintStatus = derived
    } else if (sprint) {
      newSprintStatus = sprint.status
    }
  }

  return {
    ...updatedTask,
    sprintId: updatedTask.sprintId,
    newSprintStatus
  }
})
