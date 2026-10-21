<script setup lang="ts">
import { Doughnut, Bar } from 'vue-chartjs'

const api = useApi()
const { data: dashboard, refresh, pending } = await useAsyncData('finance-dashboard', () => api<{
  month: string; ingresos: number; gastos: number; retiros: number; balance: number; movementsCount: number; excludedMovements?: number
  byCategory: Array<{ category: string; gastos: number; ingresos: number }>
  totals: { ingresos: number; gastos: number; retiros: number }
  cuotas: { total: number; activas: number; pendientes: number }
}>('/api/dashboard'))

const fmt = (n: number) => '₡' + Number(n).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const baseChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: 'rgb(148 163 184)' } }
  }
}

const barChartOptions = {
  ...baseChartOptions,
  indexAxis: 'y' as const,
  scales: {
    x: { ticks: { color: 'rgb(148 163 184)' }, grid: { color: 'rgba(148,163,184,0.1)' } },
    y: { ticks: { color: 'rgb(148 163 184)' }, grid: { color: 'rgba(148,163,184,0.1)' } }
  }
}

// Distribución de movimientos del mes (ingreso/gasto/retiro)
const movementsTypeData = computed(() => ({
  labels: ['Ingresos', 'Gastos', 'Retiros'],
  datasets: [{
    data: [
      dashboard.value?.ingresos ?? 0,
      dashboard.value?.gastos ?? 0,
      dashboard.value?.retiros ?? 0
    ],
    backgroundColor: ['#34D399', '#F87171', '#FBBF24']
  }]
}))

// Gastos por categoría del mes
const categoryData = computed(() => {
  const cats = dashboard.value?.byCategory ?? []
  return {
    labels: cats.map((c: any) => c.category),
    datasets: [{
      label: 'Gastos ₡',
      data: cats.map((c: any) => c.gastos),
      backgroundColor: ['#A78BFA', '#22D3EE', '#F472B6', '#FBBF24', '#34D399', '#60A5FA', '#FB7185', '#F87171']
    }]
  }
})
</script>

<template>
  <div class="h-full overflow-y-auto p-6 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-slate-100">Dashboard Financiero</h1>
        <p class="text-sm text-slate-400 mt-0.5">Resumen del mes: {{ dashboard?.month ?? '—' }}</p>
      </div>
      <UButton icon="i-lucide-refresh-cw" variant="ghost" size="sm" :loading="pending" @click="refresh()">Refresh</UButton>
    </div>

    <p v-if="dashboard?.excludedMovements" role="status" class="text-sm text-amber-200">
      {{ dashboard.excludedMovements }} movimientos no se sumaron: moneda distinta de CRC o datos pendientes de revisión. Los registros originales se conservan.
    </p>
    <!-- KPI Cards -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="glass-panel glass-panel-hover p-5 text-center">
        <p class="text-3xl font-bold text-emerald-300">{{ fmt(dashboard?.ingresos ?? 0) }}</p>
        <p class="text-sm text-slate-400 mt-1">Ingresos</p>
      </div>
      <div class="glass-panel glass-panel-hover p-5 text-center">
        <p class="text-3xl font-bold text-rose-300">{{ fmt(dashboard?.gastos ?? 0) }}</p>
        <p class="text-sm text-slate-400 mt-1">Gastos</p>
      </div>
      <div class="glass-panel glass-panel-hover p-5 text-center">
        <p class="text-3xl font-bold text-amber-300">{{ fmt(dashboard?.retiros ?? 0) }}</p>
        <p class="text-sm text-slate-400 mt-1">Retiros</p>
      </div>
      <div class="glass-panel glass-panel-hover p-5 text-center">
        <p class="text-3xl font-bold" :class="(dashboard?.balance ?? 0) >= 0 ? 'text-cyan-300' : 'text-rose-400'">
          {{ fmt(dashboard?.balance ?? 0) }}
        </p>
        <p class="text-sm text-slate-400 mt-1">Balance</p>
      </div>
    </div>

    <!-- Secondary KPIs -->
    <div class="grid grid-cols-2 lg:grid-cols-3 gap-4">
      <div class="glass-panel p-4 flex items-center justify-between">
        <span class="text-sm text-slate-300">Movimientos este mes</span>
        <span class="text-xl font-bold text-slate-100">{{ dashboard?.movementsCount ?? 0 }}</span>
      </div>
      <div class="glass-panel p-4 flex items-center justify-between">
        <span class="text-sm text-slate-300">Cuotas activas</span>
        <span class="text-xl font-bold text-slate-100">{{ dashboard?.cuotas?.activas ?? 0 }}</span>
      </div>
      <div class="glass-panel p-4 flex items-center justify-between">
        <span class="text-sm text-slate-300">Cuotas pendientes</span>
        <span class="text-xl font-bold text-amber-300">{{ dashboard?.cuotas?.pendientes ?? 0 }}</span>
      </div>
    </div>

    <!-- Charts Section -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="glass-panel p-5">
        <h2 class="font-semibold text-slate-200 mb-3">Distribución del mes</h2>
        <div class="h-64">
          <ClientOnly>
            <Doughnut :data="movementsTypeData" :options="baseChartOptions" />
          </ClientOnly>
        </div>
      </div>

      <div class="glass-panel p-5">
        <h2 class="font-semibold text-slate-200 mb-3">Gastos por categoría</h2>
        <div class="h-64">
          <ClientOnly>
            <Bar :data="categoryData" :options="barChartOptions" />
          </ClientOnly>
        </div>
      </div>
    </div>
  </div>
</template>
