<script setup lang="ts">
import type { MovementType } from '~~/shared/types/task'
import { costaRicaDate } from '~~/shared/utils/date'

const emit = defineEmits<{ (e: 'created'): void }>()

const { rocks } = useBacklog()
const api = useApi()

const form = reactive({
  fecha: costaRicaDate(),
  tipo: 'gasto' as MovementType,
  desc: '',
  cat: '',
  monto: '',
  rockId: ''
})

const creating = ref(false)
const error = ref('')
// shortcut: retry keys last only while mounted; persist intents if reload recovery is required.
let pendingRequest: { id: string; body: string } | undefined

async function onSubmit() {
  if (creating.value) return
  error.value = ''
  creating.value = true
  try {
    const body = {
      fecha: form.fecha,
      tipo: form.tipo,
      descripcion: form.desc,
      categoria: form.cat,
      monto: form.monto,
      rockId: form.rockId || undefined
    }
    const serialized = JSON.stringify(body)
    if (!pendingRequest || pendingRequest.body !== serialized) pendingRequest = { id: crypto.randomUUID(), body: serialized }
    await api('/api/movimientos', {
      method: 'POST',
      headers: { 'Idempotency-Key': pendingRequest.id },
      body
    })
    pendingRequest = undefined
    emit('created')
    form.desc = ''
    form.cat = ''
    form.monto = ''
  } catch {
    error.value = 'No se pudo confirmar el registro. Reintenta sin cambiar los datos; si los editas o recargas, revisa antes tus movimientos.'
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <form method="post" class="flex flex-wrap gap-2 items-end" @submit.prevent="onSubmit">
    <UInput v-model="form.fecha" aria-label="Fecha del movimiento" type="date" class="w-36" required />
    <USelect
      v-model="form.tipo"
      aria-label="Tipo de movimiento"
      :items="[
        { label: 'Ingreso', value: 'ingreso' },
        { label: 'Gasto', value: 'gasto' },
        { label: 'Retiro', value: 'retiro' }
      ]"
      value-key="value"
      class="w-28"
    />
    <UInput v-model="form.desc" aria-label="Descripción del movimiento" placeholder="Descripción" class="flex-1 min-w-40" required />
    <UInput v-model="form.cat" aria-label="Categoría del movimiento" placeholder="Categoría" class="w-32" required />
    <UInput v-model="form.monto" aria-label="Monto del movimiento en colones" placeholder="Monto" type="number" min="0.01" step="0.01" class="w-28" required />
    <USelect
      v-model="form.rockId"
      aria-label="Cuenta del movimiento"
      :items="rocks.map((r) => ({ label: `${r.name} (${r.id})`, value: r.id }))"
      value-key="value"
      placeholder="Cuenta (opcional)"
      class="w-40"
    />
    <UButton type="submit" color="primary" icon="i-lucide-plus" :loading="creating">Agregar</UButton>
    <p v-if="error" role="alert" class="w-full text-sm text-rose-200">{{ error }}</p>
  </form>
</template>
