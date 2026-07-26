<script setup lang="ts">
import type { Sprint } from '~~/shared/types/sprint'
import { normalizeDateToUser } from '~~/shared/utils/date'

const props = defineProps<{ sprint: Sprint }>()
const { triggerQuery } = useChatQuery()

// Formats sprint date fields for display and falls back to raw values if parsing fails.
function formatUserDate(date: string): string {
  try { return normalizeDateToUser(date) } catch { return date }
}

const statusColor = computed(() => {
  if (props.sprint.status === 'completed') return 'success'
  if (props.sprint.status === 'in_progress') return 'warning'
  if (props.sprint.status === 'on_hold') return 'neutral'
  return 'info'
})

const statusLabel = computed(() => {
  return props.sprint.status.replace('_', ' ')
})
</script>

<template>
  <div class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
    <!-- Header -->
    <div class="flex items-center gap-2 px-4 pt-3 pb-2">
      <span
        class="shrink-0 text-xs font-mono font-semibold text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950 hover:bg-cyan-100 dark:hover:bg-cyan-900 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
        :title="`Get info on ${sprint.id}`"
        @click="triggerQuery(`Give me full details about sprint ${sprint.id}`)"
      >{{ sprint.id }}</span>
      <h3 class="m-0 text-sm font-semibold text-slate-800 dark:text-slate-100 truncate flex-1">{{ sprint.name }}</h3>
    </div>

    <!-- Rock link -->
    <div class="mx-4 mb-3 flex items-center gap-1.5">
      <UIcon name="i-lucide-mountain" class="w-3.5 h-3.5 text-slate-400" />
      <span class="text-xs text-slate-400 dark:text-slate-500">{{ sprint.rockId }}</span>
    </div>

    <!-- Footer: date range + status badge -->
    <div class="px-4 py-2 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between gap-2">
      <div class="flex items-center gap-1.5">
        <UIcon name="i-lucide-calendar-range" class="w-3.5 h-3.5 text-slate-400" />
        <span class="text-xs text-slate-400 dark:text-slate-500">{{ formatUserDate(sprint.startDate) }} → {{ formatUserDate(sprint.endDate) }}</span>
      </div>
      <UBadge :color="statusColor" variant="subtle" size="sm" class="capitalize shrink-0">{{ statusLabel }}</UBadge>
    </div>
  </div>
</template>

