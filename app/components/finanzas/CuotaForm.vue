<script setup lang="ts">
const emit = defineEmits<{ (e: 'created'): void }>()
const api = useApi()

const form = reactive({
  nombre: '',
  frecuencia: 'mensual' as 'mensual' | 'anual',
  monto: '',
  categoria: ''
})

const creating = ref(false)

async function onSubmit() {
  if (creating.value) return
  creating.value = true
  try {
    await api('/api/cuotas', {
      method: 'POST',
      body: {
        nombre: form.nombre,
        frecuencia: form.frecuencia,
        monto: form.monto,
        categoria: form.categoria
      }
    })
    emit('created')
    form.nombre = ''
    form.monto = ''
    form.categoria = ''
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <form class="flex flex-wrap gap-2 items-end" @submit.prevent="onSubmit">
    <UInput v-model="form.nombre" placeholder="Nombre (ej. Netflix, Seguro)" class="flex-1 min-w-40" required />
    <USelect
      v-model="form.frecuencia"
      :items="[{ label: 'Mensual', value: 'mensual' }, { label: 'Anual', value: 'anual' }]"
      value-key="value"
      class="w-28"
    />
    <UInput v-model="form.monto" placeholder="Monto" type="number" step="0.01" class="w-28" required />
    <UInput v-model="form.categoria" placeholder="Categoría" class="w-32" required />
    <UButton type="submit" color="primary" icon="i-lucide-plus" :loading="creating">Agregar cuota</UButton>
  </form>
</template>
