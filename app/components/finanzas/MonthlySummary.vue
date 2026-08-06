<script setup lang="ts">
const props = defineProps<{
  ingresos: number
  gastos: number
  retiros: number
  balance: number
}>()

const fmt = (n: number) => '₡' + Number(n).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
</script>

<template>
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
    <div class="glass-panel glass-panel-hover p-4">
      <span class="block text-xs font-semibold uppercase tracking-wider text-emerald-300/80">Ingresos del mes</span>
      <strong class="block mt-1 text-xl font-bold text-emerald-300">{{ fmt(props.ingresos) }}</strong>
    </div>

    <div class="glass-panel glass-panel-hover p-4">
      <span class="block text-xs font-semibold uppercase tracking-wider text-rose-300/80">Gastos del mes</span>
      <strong class="block mt-1 text-xl font-bold text-rose-300">{{ fmt(props.gastos) }}</strong>
    </div>

    <div class="glass-panel glass-panel-hover p-4">
      <span class="block text-xs font-semibold uppercase tracking-wider text-amber-300/80">Retiros del mes</span>
      <strong class="block mt-1 text-xl font-bold text-amber-300">{{ fmt(props.retiros) }}</strong>
    </div>

    <div class="glass-panel glass-panel-hover p-4">
      <span class="block text-xs font-semibold uppercase tracking-wider text-slate-300/80">Balance</span>
      <strong
        class="block mt-1 text-xl font-bold"
        :class="props.balance >= 0 ? 'text-cyan-300' : 'text-rose-400'"
      >{{ fmt(props.balance) }}</strong>
    </div>
  </div>
</template>
