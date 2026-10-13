import type { Rock } from '~~/shared/types/rock'
import type { Sprint } from '~~/shared/types/sprint'
import type { Task } from '~~/shared/types/task'
import type { Cuota } from '~~/shared/types/cuota'

/**
 * Manages backlog state including accounts (rocks), periods (sprints), movements (tasks), and cuotas.
 *
 * @returns An object containing reactive states for finance items and methods to refresh and update them.
 */
export function useBacklog() {
  const api = useApi()
  const auth = useAuth()
  const rocks = useState<Rock[]>('rocks', () => [])
  const sprints = useState<Sprint[]>('sprints', () => [])
  const tasks = useState<Task[]>('tasks', () => [])
  const cuotas = useState<Cuota[]>('cuotas', () => [])
  const loading = useState<boolean>('backlog-loading', () => false)

  async function refreshBacklog() {
    const version = auth.version()
    loading.value = true

    try {
      const [rockRows, sprintRows, taskRows, cuotaRows] = await Promise.all([
        api<Rock[]>('/api/rocks'),
        api<Sprint[]>('/api/sprints'),
        api<Task[]>('/api/tasks'),
        api<Cuota[]>('/api/cuotas')
      ])

      if (version !== auth.version()) return
      rocks.value = rockRows
      sprints.value = sprintRows
      tasks.value = taskRows
      cuotas.value = cuotaRows
    } finally {
      if (version === auth.version()) loading.value = false
    }
  }

  // Updates a period's status in the backend and reflects the change locally in the state.
  async function updateSprintStatus(id: string, status: Sprint['status']) {
    const version = auth.version()
    const updated = await api<Sprint>(`/api/sprints/${id}`, {
      method: 'PATCH',
      body: { status }
    })
    if (version !== auth.version()) return
    const idx = sprints.value.findIndex(s => s.id === id)
    if (idx !== -1) sprints.value[idx] = updated
  }

  // Updates a movement's status in the backend and reflects the change locally in the state.
  async function updateTaskStatus(id: string, status: Task['status']) {
    const version = auth.version()
    const updated = await api<Task>(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: { status }
    })
    if (version !== auth.version()) return
    const idx = tasks.value.findIndex(t => t.id === id)
    if (idx !== -1) tasks.value[idx] = updated
  }

  // Marks a cuota as paid and refreshes the local cuotas list.
  async function markCuotaPagada(id: string) {
    const version = auth.version()
    const updated = await api<Cuota>(`/api/cuotas/${id}`, {
      method: 'PATCH',
      body: { action: 'marcar_pagada' }
    })
    if (version !== auth.version()) return
    const idx = cuotas.value.findIndex(c => c.id === id)
    if (idx !== -1) cuotas.value[idx] = updated
  }

  // Deletes a cuota and refreshes the local cuotas list.
  async function deleteCuota(id: string) {
    const version = auth.version()
    await api(`/api/cuotas/${id}`, { method: 'DELETE' })
    if (version !== auth.version()) return
    cuotas.value = cuotas.value.filter(c => c.id !== id)
  }

  return {
    rocks,
    sprints,
    tasks,
    cuotas,
    loading,
    refreshBacklog,
    updateSprintStatus,
    updateTaskStatus,
    markCuotaPagada,
    deleteCuota
  }
}
