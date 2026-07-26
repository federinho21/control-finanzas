<script setup lang="ts">
import type { Task } from '~~/shared/types/task'
import { normalizeDateToUser } from '~~/shared/utils/date'

const props = defineProps<{ task: Task }>()

const { updateTaskStatus } = useBacklog()
const { triggerQuery } = useChatQuery()
const updating = ref(false)

const statusOptions = [
  { label: 'Pending', value: 'pending' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'On Hold', value: 'on_hold' },
  { label: 'Completed', value: 'completed' },
]

// Updates the local and remote task status when the user changes it.
async function onStatusChange(newStatus: string) {
  updating.value = true
  try {
    await updateTaskStatus(props.task.id, newStatus as Task['status'])
  } finally {
    updating.value = false
  }
}

// Formats task dates for user display with fallback to the original backend string.
function formatUserDate(date: string): string {
  try { return normalizeDateToUser(date) } catch { return date }
}

// Computes the color to represent priority level visually on the badge.
const priorityColor = computed(() => {
  if (props.task.priority === 'high') return 'error'
  if (props.task.priority === 'medium') return 'warning'
  return 'neutral'
})
</script>

<template>
  <div class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
    <!-- Header -->
    <div class="px-4 pt-3 pb-2 flex items-start gap-2">
      <span
        class="shrink-0 mt-0.5 text-xs font-mono font-semibold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950 hover:bg-violet-100 dark:hover:bg-violet-900 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
        :title="`Get info on ${task.id}`"
        @click="triggerQuery(`Give me full details about task ${task.id}`)"
      >{{ task.id }}</span>
      <p class="m-0 text-sm font-medium text-slate-800 dark:text-slate-100 leading-snug flex-1">{{ task.description }}</p>
      <UBadge :color="priorityColor" variant="subtle" size="xs" class="shrink-0 capitalize mt-0.5">{{ task.priority }}</UBadge>
    </div>

    <!-- Meta -->
    <div class="mx-4 mb-3 flex flex-wrap gap-3">
      <div class="flex items-center gap-1.5">
        <UIcon name="i-lucide-user" class="w-3.5 h-3.5 text-slate-400" />
        <span class="text-xs text-slate-400 dark:text-slate-500">{{ task.owner }}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <UIcon name="i-lucide-link" class="w-3.5 h-3.5 text-slate-400" />
        <span class="text-xs text-slate-400 dark:text-slate-500">{{ task.rockId }} / {{ task.sprintId }}</span>
      </div>
    </div>

    <!-- Footer -->
    <div class="px-4 py-2 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between gap-2 text-sm">
      <div class="flex items-center gap-1.5">
        <UIcon name="i-lucide-calendar" class="w-3.5 h-3.5 text-slate-400" />
        <span class="text-slate-400 dark:text-slate-500">Deadline: {{ formatUserDate(task.deadline) }}</span>
      </div>
      <USelect
        :model-value="task.status"
        :items="statusOptions"
        value-key="value"
        size="xs"
        :loading="updating"
        :disabled="updating"
        @update:model-value="onStatusChange"
      />
    </div>
  </div>
</template>

