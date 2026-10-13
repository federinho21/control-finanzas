<script setup lang="ts">
import type { MovementType } from '~~/shared/types/task'

const emit = defineEmits<{ (e: 'created'): void }>()

const { rocks } = useBacklog()
const api = useApi()

const form = reactive({
  fecha: new Date().toISOString().slice(0, 10),
  tipo: 'gasto' as MovementType,
  desc: '',
  cat: '',
  monto: '',
  rockId: ''
})

const creating = ref(false)

async function onSubmit() {
  if (creating.value) return
  creating.value = true
  try {
    await api('/api/movimientos', {
      method: 'POST',
      body: {
        fecha: form.fecha,
        tipo: form.tipo,
        descripcion: form.desc,
        categoria: form.cat,
        monto: form.monto,
        rockId: form.rockId || undefined
      }
    })
    emit('created')
    form.desc = ''
    form.cat = ''
    form.monto = ''
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <form class="flex flex-wrap gap-2 items-end" @submit.prevent="onSubmit">
    <UInput v-model="form.fecha" type="date" class="w-36" required />
    <USelect
      v-model="form.tipo"
      :items="[
        { label: 'Ingreso', value: 'ingreso' },
        { label: 'Gasto', value: 'gasto' },
        { label: 'Retiro', value: 'retiro' }
      ]"
      value-key="value"
      class="w-28"
    />
    <UInput v-model="form.desc" placeholder="Descripción" class="flex-1 min-w-40" required />
    <UInput v-model="form.cat" placeholder="Categoría" class="w-32" required />
    <UInput v-model="form.monto" placeholder="Monto" type="number" step="0.01" class="w-28" required />
    <USelect
      v-model="form.rockId"
      :items="rocks.map((r) => ({ label: `${r.name} (${r.id})`, value: r.id }))"
      value-key="value"
      placeholder="Cuenta (opcional)"
      class="w-40"
    />
    <UButton type="submit" color="primary" icon="i-lucide-plus" :loading="creating">Agregar</UButton>
  </form>
</template>
