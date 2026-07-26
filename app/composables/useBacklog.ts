import type { Rock } from '~~/shared/types/rock'
import type { Sprint } from '~~/shared/types/sprint'
import type { Task } from '~~/shared/types/task'

/**
 * Manages backlog state including rocks, sprints, and tasks.
 * 
 * @returns An object containing reactive states for backlog items and methods to refresh and update them.
 */
export function useBacklog() {
  const rocks = useState<Rock[]>('rocks', () => [])
  const sprints = useState<Sprint[]>('sprints', () => [])
  const tasks = useState<Task[]>('tasks', () => [])
  const loading = useState<boolean>('backlog-loading', () => false)

  async function refreshBacklog() {
    loading.value = true

    try {
      const [rockRows, sprintRows, taskRows] = await Promise.all([
        $fetch<Rock[]>('/api/rocks'),
        $fetch<Sprint[]>('/api/sprints'),
        $fetch<Task[]>('/api/tasks')
      ])

      rocks.value = rockRows
      sprints.value = sprintRows
      tasks.value = taskRows
    } finally {
      loading.value = false
    }
  }

  // Updates a sprint's status in the backend and reflects the change locally in the state.
  async function updateSprintStatus(id: string, status: Sprint['status']) {
    const updated = await $fetch<Sprint>(`/api/sprints/${id}`, {
      method: 'PATCH',
      body: { status }
    })
    const idx = sprints.value.findIndex(s => s.id === id)
    if (idx !== -1) sprints.value[idx] = updated
  }

  // Updates a task's status in the backend and reflects the change locally in the state.
  async function updateTaskStatus(id: string, status: Task['status']) {
    const updated = await $fetch<Task>(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: { status }
    })
    const idx = tasks.value.findIndex(t => t.id === id)
    if (idx !== -1) tasks.value[idx] = updated
  }

  return {
    rocks,
    sprints,
    tasks,
    loading,
    refreshBacklog,
    updateSprintStatus,
    updateTaskStatus
  }
}
