<script setup lang="ts">
import RockCard from './RockCard.vue'
import SprintCard from './SprintCard.vue'
import MonthlySummary from '../finanzas/MonthlySummary.vue'
import MovimientoTable from '../finanzas/MovimientoTable.vue'
import MovimientoForm from '../finanzas/MovimientoForm.vue'
import CuotaForm from '../finanzas/CuotaForm.vue'
import CuotaPanel from '../finanzas/CuotaPanel.vue'

const tab = ref<'movimientos' | 'cuotas' | 'periodos'>('movimientos')
const { rocks, sprints, tasks, cuotas, loading, refreshBacklog } = useBacklog()
const { resumen, loadResumen } = useResumen()
const mesSeleccionado = ref<string>(new Date().toISOString().slice(0, 7))

const mesesDisponibles = computed(() => {
  const set = new Set<string>()
  tasks.value.forEach((t) => set.add(t.deadline.slice(0, 7)))
  set.add(new Date().toISOString().slice(0, 7))
  return [...set].sort().reverse()
})

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
    <div class="shrink-0 flex flex-col gap-3 pb-3 border-b border-slate-200/15">
      <div class="flex justify-between items-center">
        <h2 class="m-0 text-lg font-semibold text-slate-100">Finanzas</h2>
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

      <div class="flex gap-2" role="group" aria-label="Finance sections">
        <UButton
          :color="tab === 'movimientos' ? 'primary' : 'neutral'"
          :variant="tab === 'movimientos' ? 'solid' : 'ghost'"
          icon="i-lucide-arrow-left-right"
          size="sm"
          @click="() => { tab = 'movimientos' }"
        >
          Movimientos
        </UButton>
        <UButton
          :color="tab === 'cuotas' ? 'primary' : 'neutral'"
          :variant="tab === 'cuotas' ? 'solid' : 'ghost'"
          icon="i-lucide-repeat"
          size="sm"
          @click="() => { tab = 'cuotas' }"
        >
          Cuotas fijas
        </UButton>
        <UButton
          :color="tab === 'periodos' ? 'primary' : 'neutral'"
          :variant="tab === 'periodos' ? 'solid' : 'ghost'"
          icon="i-lucide-calendar-range"
          size="sm"
          @click="() => { tab = 'periodos' }"
        >
          Períodos
        </UButton>
      </div>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto pt-3 flex flex-col gap-4">
      <div v-if="tab !== 'periodos'" class="flex flex-col gap-4">
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

        <MovimientoForm @created="loadAll" />
        <MovimientoTable v-if="tab === 'movimientos'" :movements="tasks" @refresh="loadAll" />
        <template v-else>
          <CuotaForm @created="loadAll" />
          <CuotaPanel :cuotas="cuotas" @refresh="loadAll" />
        </template>
      </div>

      <div v-else class="flex flex-col gap-3">
        <SprintCard v-for="sprint in sprints" :key="sprint.id" :sprint="sprint" />
        <div v-if="!sprints.length" class="glass-panel p-6 text-center">
          <p class="font-semibold text-slate-200 m-0">No hay períodos aún.</p>
          <p class="text-sm text-slate-400 mt-1 m-0">Registra un movimiento en Finanzas para crear el período correspondiente.</p>
        </div>
      </div>
    </div>
  </section>
</template>
