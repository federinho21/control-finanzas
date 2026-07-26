export type RockStatus = 'active' | 'completed' | 'blocked'

export interface Rock {
  id: string
  name: string
  description: string
  deadline: string
  status: RockStatus
  createdAt: string
}
