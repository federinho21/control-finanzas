export type TaskPriority = 'high' | 'medium' | 'low'
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'on_hold'

export interface Task {
  id: string
  description: string
  owner: string
  deadline: string
  priority: TaskPriority
  status: TaskStatus
  rockId: string
  sprintId: string
  createdAt: string
}

export interface ProposedTask {
  description: string
  owner: string
  deadline: string
  priority: TaskPriority
  selected?: boolean
}
