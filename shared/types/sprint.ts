export type SprintStatus = 'planned' | 'in_progress' | 'completed' | 'on_hold'

export interface Sprint {
  id: string
  name: string
  startDate: string
  endDate: string
  rockId: string
  status: SprintStatus
  createdAt: string
}
