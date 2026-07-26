<script setup lang="ts">
import { Doughnut, Bar } from 'vue-chartjs'

const { data: dashboard, refresh, pending } = await useFetch('/api/dashboard')

// Agregado de comentarios según las preferencias del usuario

// Almacena los identificadores de los "Rocks" que están abiertos en el acordeón
const openRocks = ref<Set<string>>(new Set())
// Almacena los identificadores de los "Sprints" que están abiertos en el acordeón
const openSprints = ref<Set<string>>(new Set())

// Alterna la visibilidad de un "Rock" (lo abre si está cerrado, lo cierra si está abierto)
function toggleRock(id: string) {
  if (openRocks.value.has(id)) openRocks.value.delete(id)
  else openRocks.value.add(id)
}

// Alterna la visibilidad de un "Sprint"
function toggleSprint(id: string) {
  if (openSprints.value.has(id)) openSprints.value.delete(id)
  else openSprints.value.add(id)
}

// Obtiene el color de la etiqueta según el estado
function statusBadgeColor(status: string) {
  if (status === 'completed') return 'success'
  if (status === 'in_progress') return 'warning'
  if (status === 'on_hold') return 'secondary'
  if (status === 'blocked') return 'error'
  return 'neutral'
}

// Obtiene el color de la etiqueta según la prioridad
function priorityColor(priority: string) {
  if (priority === 'high') return 'error'
  if (priority === 'medium') return 'warning'
  return 'neutral'
}

// Configuración base para todos los gráficos
const baseChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: 'rgb(148 163 184)' } }
  }
}

// Opciones específicas para gráficos de barras horizontales
const barChartOptions = {
  ...baseChartOptions,
  indexAxis: 'y' as const,
  scales: {
    x: { ticks: { color: 'rgb(148 163 184)' }, grid: { color: 'rgba(148,163,184,0.1)' } },
    y: { ticks: { color: 'rgb(148 163 184)' }, grid: { color: 'rgba(148,163,184,0.1)' } }
  }
}

// Calcula la data para el gráfico de estado de tareas
const taskStatusData = computed(() => {
  const pending = dashboard.value?.tasksByStatus?.pending ?? 0
  const inProgress = dashboard.value?.tasksByStatus?.in_progress ?? 0
  const completed = dashboard.value?.tasksByStatus?.completed ?? 0
  const onHold = dashboard.value?.tasksByStatus?.on_hold ?? 0
  
  return {
    labels: ['Pending', 'In Progress', 'Completed', 'On Hold'],
    datasets: [{
      data: [pending, inProgress, completed, onHold],
      backgroundColor: ['#60a5fa', '#f59e0b', '#10b981', '#c084fc']
    }]
  }
})

// Calcula la data para el gráfico de estado de sprints
const sprintStatusData = computed(() => {
  const planned = dashboard.value?.sprintsByStatus?.planned ?? 0
  const inProgress = dashboard.value?.sprintsByStatus?.in_progress ?? 0
  const completed = dashboard.value?.sprintsByStatus?.completed ?? 0
  const onHold = dashboard.value?.sprintsByStatus?.on_hold ?? 0
  
  return {
    labels: ['Planned', 'In Progress', 'Completed', 'On Hold'],
    datasets: [{
      data: [planned, inProgress, completed, onHold],
      backgroundColor: ['#60a5fa', '#f59e0b', '#10b981', '#c084fc']
    }]
  }
})

// Calcula la data para el gráfico de porcentaje de completado de los rocks
const rockCompletionData = computed(() => {
  const rocks = dashboard.value?.rocks ?? []
  return {
    labels: rocks.map((r: any) => r.name),
    datasets: [{
      label: 'Completion %',
      data: rocks.map((r: any) => r.completionPercent),
      backgroundColor: '#818CF8'
    }]
  }
})
</script>

<template>
  <div class="h-full overflow-y-auto p-6 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-slate-900 dark:text-slate-100">Executive Dashboard</h1>
      <UButton icon="i-lucide-refresh-cw" variant="ghost" size="sm" :loading="pending" @click="refresh()">Refresh</UButton>
    </div>

    <!-- KPI Cards -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <UCard>
        <div class="text-center">
          <p class="text-3xl font-bold text-blue-500">{{ dashboard?.totals.rocks ?? 0 }}</p>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Rocks</p>
        </div>
      </UCard>
      <UCard>
        <div class="text-center">
          <p class="text-3xl font-bold text-cyan-500">{{ dashboard?.totals.sprints ?? 0 }}</p>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Sprints</p>
        </div>
      </UCard>
      <UCard>
        <div class="text-center">
          <p class="text-3xl font-bold text-violet-500">{{ dashboard?.totals.tasks ?? 0 }}</p>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Tasks</p>
        </div>
      </UCard>
      <UCard>
        <div class="text-center">
          <p class="text-3xl font-bold text-emerald-500">{{ dashboard?.headcount ?? 0 }}</p>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Team Members</p>
        </div>
      </UCard>
    </div>

    <!-- Charts Section -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <!-- Chart 1: Task Status -->
      <UCard>
        <template #header>
          <h2 class="font-semibold text-slate-800 dark:text-slate-200">Task Status</h2>
        </template>
        <div class="h-64">
          <ClientOnly>
            <Doughnut :data="taskStatusData" :options="baseChartOptions" />
          </ClientOnly>
        </div>
      </UCard>

      <!-- Chart 2: Sprint Status -->
      <UCard>
        <template #header>
          <h2 class="font-semibold text-slate-800 dark:text-slate-200">Sprint Status</h2>
        </template>
        <div class="h-64">
          <ClientOnly>
            <Doughnut :data="sprintStatusData" :options="baseChartOptions" />
          </ClientOnly>
        </div>
      </UCard>

      <!-- Chart 3: Rock Completion % -->
      <UCard class="lg:col-span-2">
        <template #header>
          <h2 class="font-semibold text-slate-800 dark:text-slate-200">Rock Completion %</h2>
        </template>
        <div class="h-64">
          <ClientOnly>
            <Bar :data="rockCompletionData" :options="barChartOptions" />
          </ClientOnly>
        </div>
      </UCard>
    </div>

    <!-- Rocks nested accordion -->
    <UCard>
      <template #header>
        <h2 class="font-semibold text-slate-800 dark:text-slate-200">Rocks</h2>
      </template>

      <div v-if="!dashboard?.rocks?.length" class="text-sm text-slate-400 text-center py-4">No rocks yet.</div>

      <div v-else class="space-y-2">
        <!-- Rock item -->
        <div
          v-for="rock in dashboard!.rocks"
          :key="rock.id"
          class="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden"
        >
          <!-- Rock trigger -->
          <button
            class="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors text-left"
            @click="toggleRock(rock.id)"
          >
            <UIcon
              name="i-lucide-chevron-right"
              class="w-4 h-4 text-slate-400 transition-transform shrink-0"
              :class="{ 'rotate-90': openRocks.has(rock.id) }"
            />
            <span class="text-xs font-mono font-semibold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 rounded shrink-0">{{ rock.id }}</span>
            <span class="text-sm font-semibold text-slate-800 dark:text-slate-100 flex-1">{{ rock.name }}</span>
            <UBadge :color="statusBadgeColor(rock.status)" variant="subtle" size="sm" class="capitalize shrink-0">{{ rock.status.replace('_', ' ') }}</UBadge>
            <span class="text-xs text-slate-400 shrink-0">{{ rock.completedTasks }}/{{ rock.totalTasks }} · {{ rock.completionPercent }}%</span>
          </button>

          <!-- Rock content -->
          <div v-if="openRocks.has(rock.id)" class="px-4 pb-3 pt-2 space-y-2">
            <!-- Progress bar -->
            <div class="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5 mb-3">
              <div
                class="h-1.5 rounded-full transition-all"
                :class="rock.completionPercent === 100 ? 'bg-emerald-500' : 'bg-blue-500'"
                :style="`width: ${rock.completionPercent}%`"
              />
            </div>

            <div v-if="!rock.sprints?.length" class="text-xs text-slate-400 py-1">No sprints for this rock.</div>

            <!-- Sprint item -->
            <div
              v-for="sprint in rock.sprints"
              :key="sprint.id"
              class="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden"
            >
              <!-- Sprint trigger -->
              <button
                class="w-full flex items-center gap-2 px-3 py-2.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left"
                @click="toggleSprint(sprint.id)"
              >
                <UIcon
                  name="i-lucide-chevron-right"
                  class="w-3.5 h-3.5 text-slate-400 transition-transform shrink-0"
                  :class="{ 'rotate-90': openSprints.has(sprint.id) }"
                />
                <span class="text-xs font-mono font-semibold text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950 px-1.5 py-0.5 rounded shrink-0">{{ sprint.id }}</span>
                <span class="text-sm font-medium text-slate-700 dark:text-slate-200 flex-1">{{ sprint.name }}</span>
                <UBadge :color="statusBadgeColor(sprint.status)" variant="subtle" size="sm" class="capitalize shrink-0">{{ sprint.status.replace('_', ' ') }}</UBadge>
                <span class="text-xs text-slate-400 shrink-0">
                  <span class="text-emerald-600 dark:text-emerald-400">{{ sprint.statusBreakdown.completed }} done</span>
                  · <span class="text-amber-500">{{ sprint.statusBreakdown.in_progress }} active</span>
                  · {{ sprint.statusBreakdown.pending }} pending
                </span>
              </button>

              <!-- Sprint content: task list -->
              <div v-if="openSprints.has(sprint.id)" class="divide-y divide-slate-100 dark:divide-slate-700">
                <div v-if="!sprint.tasks?.length" class="px-4 py-3 text-xs text-slate-400">No tasks.</div>
                <div
                  v-for="task in sprint.tasks"
                  :key="task.id"
                  class="flex items-start justify-between gap-3 px-4 py-2.5"
                >
                  <div class="flex items-start gap-2 min-w-0">
                    <span class="shrink-0 text-xs font-mono font-semibold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950 px-1.5 py-0.5 rounded mt-0.5">{{ task.id }}</span>
                    <div class="min-w-0">
                      <p class="text-sm text-slate-700 dark:text-slate-300 leading-snug">{{ task.description }}</p>
                      <p class="text-xs text-slate-400 mt-0.5">{{ task.owner }}</p>
                    </div>
                  </div>
                  <div class="flex items-center gap-1.5 shrink-0">
                    <UBadge :color="priorityColor(task.priority)" variant="subtle" size="xs" class="capitalize">{{ task.priority }}</UBadge>
                    <UBadge :color="statusBadgeColor(task.status)" variant="subtle" size="sm" class="capitalize">{{ task.status.replace('_', ' ') }}</UBadge>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
