import type { ProposedTask } from '~~/shared/types/task'
import type { ProposedPlan } from '~~/shared/types/plan'

interface PendingTaskBatch {
  sessionId: string
  rockId: string
  sprintId: string
  tasks: ProposedTask[]
}

interface PendingDelete {
  sessionId: string
  rockId: string
}

interface PendingPlan {
  sessionId: string
  plan: ProposedPlan
}

const pendingTaskBatches = new Map<string, PendingTaskBatch>()
const pendingDeletes = new Map<string, PendingDelete>()
const pendingPlans = new Map<string, PendingPlan>()

/**
 * Saves a pending task batch approval for later consumption.
 * @param actionId - Unique action identifier
 * @param data - Task batch data including session ID, rock ID, sprint ID, and tasks
 */
export function savePendingTasks(actionId: string, data: PendingTaskBatch) {
  pendingTaskBatches.set(actionId, data)
}

/**
 * Returns pending tasks without consuming the action.
 * @param actionId - Unique action identifier
 * @returns The pending task batch data, or undefined if not found
 */
export function getPendingTasks(actionId: string) {
  return pendingTaskBatches.get(actionId)
}

/**
 * Retrieves and removes pending tasks from the store (consumes the action).
 * @param actionId - Unique action identifier
 * @returns The pending task batch data, or undefined if not found
 */
export function takePendingTasks(actionId: string) {
  const data = pendingTaskBatches.get(actionId)
  pendingTaskBatches.delete(actionId)
  return data
}

/**
 * Saves a pending delete approval for later consumption.
 * @param actionId - Unique action identifier
 * @param data - Delete request data including session ID and rock ID
 */
export function savePendingDelete(actionId: string, data: PendingDelete) {
  pendingDeletes.set(actionId, data)
}

/**
 * Returns pending deletion request without consuming the action.
 * @param actionId - Unique action identifier
 * @returns The pending delete data, or undefined if not found
 */
export function getPendingDelete(actionId: string) {
  return pendingDeletes.get(actionId)
}

/**
 * Retrieves and removes pending delete request from the store (consumes the action).
 * @param actionId - Unique action identifier
 * @returns The pending delete data, or undefined if not found
 */
export function takePendingDelete(actionId: string) {
  const data = pendingDeletes.get(actionId)
  pendingDeletes.delete(actionId)
  return data
}

/**
 * Saves a pending plan approval for later consumption.
 * @param actionId - Unique action identifier
 * @param data - Plan approval data including session ID and proposed plan
 */
export function savePendingPlan(actionId: string, data: PendingPlan) {
  pendingPlans.set(actionId, data)
}

/**
 * Returns pending plan approval without consuming the action.
 * @param actionId - Unique action identifier
 * @returns The pending plan data, or undefined if not found
 */
export function getPendingPlan(actionId: string) {
  return pendingPlans.get(actionId)
}

/**
 * Retrieves and removes pending plan approval from the store (consumes the action).
 * @param actionId - Unique action identifier
 * @returns The pending plan data, or undefined if not found
 */
export function takePendingPlan(actionId: string) {
  const data = pendingPlans.get(actionId)
  pendingPlans.delete(actionId)
  return data
}

/**
 * Finds a pending plan entry by session ID without consuming it.
 * @param sessionId - The session ID to search for.
 * @returns The actionId and plan data if found, otherwise undefined.
 */
export function findPendingPlanBySessionId(sessionId: string): { actionId: string; data: { sessionId: string; plan: import('~~/shared/types/plan').ProposedPlan } } | undefined {
  for (const [actionId, data] of pendingPlans.entries()) {
    if (data.sessionId === sessionId) {
      return { actionId, data }
    }
  }
  return undefined
}
