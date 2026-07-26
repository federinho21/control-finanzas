import type { ProposedTask } from './task'
import type { ProposedPlan } from './plan'

export type ChatRole = 'user' | 'assistant' | 'system' | 'status' | 'judge' | 'guardrail' | 'warning' | 'error'

export interface UiAction {
  type: 'approve_tasks' | 'confirm_delete' | 'approve_plan' | 'update_sprint_status' | 'update_task_status'
  actionId: string
  label: string
  variant?: 'solid' | 'soft' | 'outline'
  color?: 'primary' | 'neutral' | 'success' | 'warning' | 'error'
  payload?: Record<string, unknown>
}

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: string
  proposedTasks?: ProposedTask[]
  proposedPlan?: ProposedPlan
  actions?: UiAction[]
}
