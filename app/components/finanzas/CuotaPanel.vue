<script setup lang="ts">
import type { Cuota } from '~~/shared/types/cuota'

const props = defineProps<{ cuotas: Cuota[] }>()
const emit = defineEmits<{ (e: 'refresh'): void }>()

const { markCuotaPagada, deleteCuota } = useBacklog()
const { triggerQuery } = useChatQuery()

const fmt = (n: string) => '₡' + Number(n).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function isPaid(cuota: Cuota, now: Date = new Date()) {
  if (!cuota.ultimoPago) return false
  const year = now.toISOString().slice(0, 4)
  return cuota.frecuencia === 'mensual'
    ? cuota.ultimoPago.slice(0, 7) === now.toISOString().slice(0, 7)
    : cuota.ultimoPago.slice(0, 4) === year
}

async function onMarkPaid(cuota: Cuota) {
  await markCuotaPagada(cuota.id)
  emit('refresh')
}

async function onDelete(cuota: Cuota) {
  await deleteCuota(cuota.id)
  emit('refresh')
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div
      v-for="cuota in props.cuotas"
      :key="cuota.id"
      class="glass-panel glass-panel-hover p-4 flex items-center justify-between gap-3"
    >
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <span
            class="shrink-0 text-xs font-mono font-semibold text-violet-300 bg-violet-500/15 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
            :title="`Get info on ${cuota.id}`"
            @click="triggerQuery(`Give me full details about cuota ${cuota.id}`)"
          >{{ cuota.id }}</span>
          <strong class="text-sm text-slate-100 truncate">{{ cuota.nombre }}</strong>
          <span class="glass-chip px-2 py-0.5 text-[0.65rem] font-semibold text-cyan-300">{{ cuota.frecuencia }}</span>
        </div>
        <p class="m-0 mt-1 text-xs text-slate-400">{{ cuota.categoria }} · último pago: {{ cuota.ultimoPago || 'nunca' }}</p>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <span class="text-sm font-bold text-slate-100">{{ fmt(cuota.monto) }}</span>
        <span
          class="glass-chip px-2 py-0.5 text-[0.65rem] font-semibold"
          :class="isPaid(cuota) ? 'text-emerald-300' : 'text-amber-300'"
        >{{ isPaid(cuota) ? 'Pagado' : 'Pendiente' }}</span>
        <UButton
          icon="i-lucide-check-check"
          color="success"
          variant="soft"
          size="xs"
          :disabled="isPaid(cuota)"
          @click="onMarkPaid(cuota)"
        >Marcar pagada</UButton>
        <UButton icon="i-lucide-trash-2" color="neutral" variant="ghost" size="xs" @click="onDelete(cuota)" />
      </div>
    </div>

    <p v-if="!props.cuotas.length" class="text-center text-sm text-slate-400 py-6">
      No hay cuotas fijas registradas. Pídele al asistente: <em>create cuota | Netflix | mensual | 5000 | Streaming</em>
    </p>
  </div>
</template>
