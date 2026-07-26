import { and, count, eq, ne } from 'drizzle-orm'
import { db } from '~~/server/db'
import { rocks, sprints, tasks } from '~~/server/db/schema'

export interface GuardrailResult {
  valid: boolean
  reason?: string
  needsConfirmation?: boolean
  metadata?: Record<string, unknown>
}

export async function validateCreateTask(input: {
  rockId: string
  sprintId: string
  deadline: string
}): Promise<GuardrailResult> {
  if (!input.rockId) {
    return { valid: false, reason: 'Strategic Anchor Rule: every task must include rockId.' }
  }

  const rock = await db.query.rocks.findFirst({ where: eq(rocks.id, input.rockId) })
  if (!rock) {
    return { valid: false, reason: `Rock ${input.rockId} does not exist.` }
  }

  const sprint = await db.query.sprints.findFirst({ where: eq(sprints.id, input.sprintId) })
  if (!sprint) {
    return { valid: false, reason: `Sprint ${input.sprintId} does not exist.` }
  }

  if (sprint.rockId !== input.rockId) {
    return { valid: false, reason: `Sprint ${input.sprintId} is not linked to Rock ${input.rockId}.` }
  }

  if (input.deadline < sprint.startDate || input.deadline > sprint.endDate) {
    return {
      valid: false,
      reason: `Sprint Boundary Rule: deadline ${input.deadline} must be between ${sprint.startDate} and ${sprint.endDate}.`
    }
  }

  return { valid: true }
}

export async function validateDeleteRock(input: {
  rockId: string
  force?: boolean
}): Promise<GuardrailResult> {
  const rock = await db.query.rocks.findFirst({ where: eq(rocks.id, input.rockId) })
  if (!rock) {
    return { valid: false, reason: `Rock ${input.rockId} does not exist.` }
  }

  const activeCount = await db
    .select({ value: count() })
    .from(tasks)
    .where(and(eq(tasks.rockId, input.rockId), ne(tasks.status, 'completed')))

  const total = activeCount[0]?.value ?? 0

  if (total > 1 && !input.force) {
    return {
      valid: false,
      reason: `Destruction Guardrail: Rock ${input.rockId} has ${total} active tasks and needs human approval before deletion.`,
      needsConfirmation: true,
      metadata: { activeTasks: total }
    }
  }

  return { valid: true }
}
