<script setup lang="ts">
import SprintCard from '../backlog/SprintCard.vue'
import MonthlySummary from './MonthlySummary.vue'
import MovimientoTable from './MovimientoTable.vue'
import MovimientoForm from './MovimientoForm.vue'
import CuotaForm from './CuotaForm.vue'
import CuotaPanel from './CuotaPanel.vue'
import { costaRicaDate } from '~~/shared/utils/date'

const tab = ref<'ingresos' | 'gastos' | 'retiros' | 'cuotas' | 'periodos'>('ingresos')
const { rocks, sprints, tasks, cuotas, loading, refreshBacklog } = useBacklog()
const { resumen, loadResumen } = useResumen()
const mesSeleccionado = ref<string>(costaRicaDate().slice(0, 7))

const mesesDisponibles = computed(() => {
  const set = new Set<string>()
  tasks.value.forEach((t) => set.add(t.deadline.slice(0, 7)))
  set.add(costaRicaDate().slice(0, 7))
  return [...set].sort().reverse()
})

// Movements filtered by the active tab's type.
const filteredMovements = computed(() => {
  const tipo = tab.value === 'ingresos' ? 'ingreso' : tab.value === 'gastos' ? 'gasto' : tab.value === 'retiros' ? 'retiro' : null
  if (!tipo) return []
  return tasks.value
    .filter((t) => t.tipo === tipo && t.deadline.slice(0, 7) === mesSeleccionado.value)
    .sort((a, b) => b.deadline.localeCompare(a.deadline))
})

const sectionMeta = {
  ingresos: { label: 'Ingresos', icon: 'i-lucide-trending-up', movementType: 'ingreso' },
  gastos: { label: 'Gastos', icon: 'i-lucide-trending-down', movementType: 'gasto' },
  retiros: { label: 'Retiros', icon: 'i-lucide-banknote', movementType: 'retiro' },
  cuotas: { label: 'Cuotas', icon: 'i-lucide-repeat' },
  periodos: { label: 'Períodos', icon: 'i-lucide-calendar-range' }
} as const

watch(mesSeleccionado, async (mes) => {
  await loadResumen(mes)
})

async function loadAll() {
  await refreshBacklog()
  await loadResumen(mesSeleccionado.value)
}

onMounted(loadAll)
</script>

<template>
  <section class="flex flex-col h-full min-h-0">
    <div class="shrink-0 flex flex-col gap-3 pb-3">
      <div class="flex justify-between items-center">
        <h1 class="m-0 text-xl sm:text-2xl font-bold text-slate-100">Mis Finanzas</h1>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-refresh-cw"
          size="sm"
          :loading="loading"
          @click="loadAll"
        >
          {{ loading ? 'Refreshing...' : 'Refresh' }}
        </UButton>
      </div>

      <!-- Sub-sections -->
      <div class="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Finance sections">
        <UButton
          v-for="(meta, key) in sectionMeta"
          :key="key"
          :color="tab === key ? 'primary' : 'neutral'"
          :variant="tab === key ? 'solid' : 'ghost'"
          :icon="meta.icon"
          size="sm"
          class="shrink-0"
          @click="() => { tab = key }"
        >
          {{ meta.label }}
        </UButton>
      </div>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto pt-3 flex flex-col gap-4">
      <!-- Movements sections: summary + month + form + table -->
      <template v-if="tab === 'ingresos' || tab === 'gastos' || tab === 'retiros'">
        <label class="flex items-center gap-2 text-sm text-slate-400">
          Mostrando:
          <USelect
            v-model="mesSeleccionado"
            :items="mesesDisponibles"
            class="w-40"
            size="sm"
          />
        </label>

        <MonthlySummary
          :ingresos="resumen?.ingresos ?? 0"
          :gastos="resumen?.gastos ?? 0"
          :retiros="resumen?.retiros ?? 0"
          :balance="resumen?.balance ?? 0"
        />
        <p v-if="resumen?.excludedMovements" role="status" class="text-sm text-amber-200">
          {{ resumen.excludedMovements }} movimientos no se sumaron: moneda distinta de CRC o datos pendientes de revisión. Los registros originales se conservan.
        </p>

        <MovimientoForm :default-type="sectionMeta[tab].movementType" @created="loadAll" />
        <MovimientoTable :movements="filteredMovements" @refresh="loadAll" />
      </template>

      <template v-else-if="tab === 'cuotas'">
        <CuotaForm @created="loadAll" />
        <CuotaPanel :cuotas="cuotas" @refresh="loadAll" />
      </template>

      <template v-else>
        <div class="flex flex-col gap-3">
          <SprintCard v-for="sprint in sprints" :key="sprint.id" :sprint="sprint" />
          <div v-if="!sprints.length" class="glass-panel p-6 text-center">
            <p class="font-semibold text-slate-200 m-0">No hay períodos aún.</p>
            <p class="text-sm text-slate-400 mt-1 m-0">Registra un movimiento para crear el período correspondiente.</p>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
