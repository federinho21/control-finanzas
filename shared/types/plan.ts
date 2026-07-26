import type { ProposedTask } from './task'

export interface ProposedRock {
  name: string
  description: string
  deadline: string
}

export interface ProposedSprint {
  name: string
  startDate: string
  endDate: string
  tasks: ProposedTask[]
}

export interface ProposedPlan {
  rock: ProposedRock
  sprints: ProposedSprint[]
}