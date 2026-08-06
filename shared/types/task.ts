export type TaskPriority = 'high' | 'medium' | 'low'
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'on_hold'
export type MovementType = 'ingreso' | 'gasto' | 'retiro'

export interface Task {
  id: string
  description: string
  owner: string
  deadline: string
  priority: TaskPriority
  status: TaskStatus
  rockId: string
  sprintId: string
  monto: string
  tipo: MovementType
  createdAt: string
}

export interface ProposedTask {
  description: string
  owner: string
  deadline: string
  priority: TaskPriority
  selected?: boolean
  monto?: string
  tipo?: MovementType
}
