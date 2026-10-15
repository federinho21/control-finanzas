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
const error = ref('')

async function onSubmit() {
  if (creating.value) return
  error.value = ''
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
  } catch {
    error.value = 'No se pudo confirmar el registro. Conservamos los datos; revisa tus cuotas antes de reintentar para evitar duplicados.'
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <form method="post" class="flex flex-wrap gap-2 items-end" @submit.prevent="onSubmit">
    <UInput v-model="form.nombre" aria-label="Nombre de la cuota" placeholder="Nombre (ej. Netflix, Seguro)" class="flex-1 min-w-40" required />
    <USelect
      v-model="form.frecuencia"
      aria-label="Frecuencia de la cuota"
      :items="[{ label: 'Mensual', value: 'mensual' }, { label: 'Anual', value: 'anual' }]"
      value-key="value"
      class="w-28"
    />
    <UInput v-model="form.monto" aria-label="Monto de la cuota en colones" placeholder="Monto" type="number" min="0.01" step="0.01" class="w-28" required />
    <UInput v-model="form.categoria" aria-label="Categoría de la cuota" placeholder="Categoría" class="w-32" required />
    <UButton type="submit" color="primary" icon="i-lucide-plus" :loading="creating">Agregar cuota</UButton>
    <p v-if="error" role="alert" class="w-full text-sm text-rose-200">{{ error }}</p>
  </form>
</template>
