<script setup lang="ts">
import type { Task } from '~~/shared/types/task'
import { normalizeDateToUser } from '~~/shared/utils/date'

const props = defineProps<{ movements: Task[] }>()

const fmt = (n: string) => '₡' + Number(n).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const typeMeta = {
  ingreso: { label: 'Ingreso', badge: 'success', text: 'text-emerald-300', bg: 'bg-emerald-400/10' },
  gasto: { label: 'Gasto', badge: 'error', text: 'text-rose-300', bg: 'bg-rose-400/10' },
  retiro: { label: 'Retiro', badge: 'warning', text: 'text-amber-300', bg: 'bg-amber-400/10' }
} as const

function tipoInfo(tipo: string) {
  return typeMeta[tipo as keyof typeof typeMeta] ?? typeMeta.gasto
}

async function onDelete(task: Task) {
  const { $toast } = useNuxtApp()
  await $fetch(`/api/tasks/${task.id}`, { method: 'DELETE' }).catch(() => null)
  emit('refresh')
  $toast?.add?.({ title: 'Movimiento eliminado', color: 'primary' })
}

const emit = defineEmits<{ (e: 'refresh'): void }>()
</script>

<template>
  <!-- Desktop table -->
  <div class="hidden sm:block overflow-hidden rounded-2xl border border-slate-200/15 bg-white/5 backdrop-blur-xl">
    <table class="w-full border-collapse">
      <thead>
        <tr>
          <th class="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Fecha</th>
          <th class="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Tipo</th>
          <th class="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Descripción</th>
          <th class="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Categoría</th>
          <th class="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Monto</th>
          <th class="px-2 py-2.5" />
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="task in props.movements"
          :key="task.id"
          class="border-t border-slate-200/10 hover:bg-white/5 transition-colors"
        >
          <td class="px-4 py-2.5 text-sm text-slate-300">{{ normalizeDateToUser(task.deadline) }}</td>
          <td class="px-4 py-2.5 text-sm font-semibold" :class="tipoInfo(task.tipo).text">{{ tipoInfo(task.tipo).label }}</td>
          <td class="px-4 py-2.5 text-sm text-slate-100">{{ task.description }}</td>
          <td class="px-4 py-2.5 text-sm text-slate-400">{{ task.owner }}</td>
          <td class="px-4 py-2.5 text-sm font-semibold text-right text-slate-100">{{ fmt(task.monto) }}</td>
          <td class="px-2 py-2.5 text-right">
            <UButton icon="i-lucide-trash-2" color="neutral" variant="ghost" size="xs" @click="onDelete(task)" />
          </td>
        </tr>
        <tr v-if="!props.movements.length">
          <td colspan="6" class="px-4 py-8 text-center text-sm text-slate-400">Sin movimientos este mes.</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Mobile cards -->
  <div class="sm:hidden flex flex-col gap-2.5">
    <div
      v-for="task in props.movements"
      :key="task.id"
      class="glass-panel glass-panel-hover p-3.5 flex items-center justify-between gap-3"
    >
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <span
            class="shrink-0 px-2 py-0.5 rounded-md text-[0.65rem] font-semibold"
            :class="[tipoInfo(task.tipo).bg, tipoInfo(task.tipo).text]"
          >{{ tipoInfo(task.tipo).label }}</span>
          <span class="text-xs text-slate-400">{{ normalizeDateToUser(task.deadline) }}</span>
        </div>
        <p class="m-0 mt-1 text-sm text-slate-100 truncate">{{ task.description }}</p>
        <p class="m-0 text-xs text-slate-400 truncate">{{ task.owner }}</p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <span class="text-sm font-bold text-slate-100">{{ fmt(task.monto) }}</span>
        <UButton icon="i-lucide-trash-2" color="neutral" variant="ghost" size="xs" @click="onDelete(task)" />
      </div>
    </div>
    <p v-if="!props.movements.length" class="text-center text-sm text-slate-400 py-6">Sin movimientos este mes.</p>
  </div>
</template>
