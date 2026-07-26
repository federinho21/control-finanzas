<script setup lang="ts">
import type { Rock } from '~~/shared/types/rock'
import { normalizeDateToUser } from '~~/shared/utils/date'

const props = defineProps<{ rock: Rock }>()

const { triggerQuery } = useChatQuery()

// Formats an ISO date string into a user-friendly format, falling back to the original string on error.
function formatUserDate(date: string): string {
  try { return normalizeDateToUser(date) } catch { return date }
}

// Computes the color variant for the status badge based on the rock's current status.
const statusColor = computed(() => {
  if (props.rock.status === 'active') return 'success'
  if (props.rock.status === 'completed') return 'info'
  if (props.rock.status === 'blocked') return 'error'
  return 'neutral'
})
</script>

<template>
  <div class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
      <div class="flex items-center gap-2 min-w-0">
        <span
          class="shrink-0 text-xs font-mono font-semibold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900 hover:bg-blue-200 dark:hover:bg-blue-800 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
          :title="`Get info on ${rock.id}`"
          @click="triggerQuery(`Give me full details about rock ${rock.id}`)"
        >{{ rock.id }}</span>
        <h3 class="m-0 text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{{ rock.name }}</h3>
      </div>
      <UBadge :color="statusColor" variant="subtle" size="xs" class="shrink-0 capitalize">{{ rock.status }}</UBadge>
    </div>

    <!-- Description -->
    <p class="mx-4 mb-3 text-sm text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">{{ rock.description }}</p>

    <!-- Footer -->
    <div class="px-4 py-2 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex items-center gap-1.5">
      <UIcon name="i-lucide-calendar" class="w-3.5 h-3.5 text-slate-400" />
      <span class="text-xs text-slate-400 dark:text-slate-500">Deadline: {{ formatUserDate(rock.deadline) }}</span>
    </div>
  </div>
</template>

