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

// Updates the local and remote movement status when the user changes it.
async function onStatusChange(newStatus: string) {
  updating.value = true
  try {
    await updateTaskStatus(props.task.id, newStatus as Task['status'])
  } finally {
    updating.value = false
  }
}

// Formats movement dates for user display with fallback to the original backend string.
function formatUserDate(date: string): string {
  try { return normalizeDateToUser(date) } catch { return date }
}

const typeMeta = {
  ingreso: { label: 'Ingreso', badge: 'success', text: 'text-emerald-300' },
  gasto: { label: 'Gasto', badge: 'error', text: 'text-rose-300' },
  retiro: { label: 'Retiro', badge: 'warning', text: 'text-amber-300' }
} as const

const typeInfo = computed(() => typeMeta[props.task.tipo] ?? typeMeta.gasto)

const montoFormatted = computed(() => '₡' + Number(props.task.monto ?? 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
</script>

<template>
  <div class="glass-panel glass-panel-hover overflow-hidden">
    <!-- Header -->
    <div class="px-4 pt-3 pb-2 flex items-start gap-2">
      <span
        class="shrink-0 mt-0.5 text-xs font-mono font-semibold text-violet-300 bg-violet-500/15 hover:bg-violet-500/25 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
        :title="`Get info on ${task.id}`"
        @click="triggerQuery(`Give me full details about movement ${task.id}`)"
      >{{ task.id }}</span>
      <p class="m-0 text-sm font-medium text-slate-100 leading-snug flex-1">{{ task.description }}</p>
      <span class="shrink-0 text-sm font-bold" :class="typeInfo.text">{{ montoFormatted }}</span>
    </div>

    <!-- Meta -->
    <div class="mx-4 mb-3 flex flex-wrap gap-3">
      <UBadge :color="typeInfo.badge" variant="subtle" size="xs" class="shrink-0">{{ typeInfo.label }}</UBadge>
      <div class="flex items-center gap-1.5">
        <UIcon name="i-lucide-tag" class="w-3.5 h-3.5 text-slate-400" />
        <span class="text-xs text-slate-400">{{ task.owner }}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <UIcon name="i-lucide-link" class="w-3.5 h-3.5 text-slate-400" />
        <span class="text-xs text-slate-400">{{ task.rockId }} / {{ task.sprintId }}</span>
      </div>
    </div>

    <!-- Footer -->
    <div class="px-4 py-2 border-t border-slate-200/10 bg-white/5 flex items-center justify-between gap-2 text-sm">
      <div class="flex items-center gap-1.5">
        <UIcon name="i-lucide-calendar" class="w-3.5 h-3.5 text-slate-400" />
        <span class="text-slate-400">Fecha: {{ formatUserDate(task.deadline) }}</span>
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
