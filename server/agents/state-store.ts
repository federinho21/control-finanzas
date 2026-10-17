import { getAgentRepository } from '../repositories/agent'
import type { ProposedPlan } from '../../shared/types/plan'
import type { ProposedTask } from '../../shared/types/task'

export function savePendingPlan(actionId: string, input: { uid: string; sessionId: string; plan: ProposedPlan }) {
  return getAgentRepository().saveAction(input.uid, input.sessionId, actionId, 'plan', input.plan)
}
export function savePendingTasks(actionId: string, input: { uid: string; sessionId: string; rockId: string; sprintId: string; tasks: ProposedTask[] }) {
  return getAgentRepository().saveAction(input.uid, input.sessionId, actionId, 'tasks', { rockId: input.rockId, sprintId: input.sprintId, tasks: input.tasks })
}
export function findPendingPlanBySessionId(uid: string, sessionId: string) { return getAgentRepository().pendingPlan(uid, sessionId) }
