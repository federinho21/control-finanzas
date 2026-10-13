<script setup lang="ts">
const auth = useAuth()
const linkedOnAndroid = ref(false)

async function login() {
  if (!linkedOnAndroid.value) return
  if (await auth.signIn()) await navigateTo('/')
}

async function retrySession() {
  await auth.restore(true)
  if (auth.user.value) await navigateTo('/')
}

async function retryLogout() {
  await auth.logout()
}

useHead({ title: 'Iniciar sesión · Control Finanzas' })
</script>

<template>
  <main class="flex min-h-dvh items-center justify-center overflow-y-auto p-6">
    <section class="glass-panel w-full max-w-md space-y-6 p-6" aria-labelledby="login-title">
      <div>
        <h1 id="login-title" class="text-2xl font-bold text-slate-100">Control Finanzas</h1>
        <p class="mt-2 text-slate-300">Inicia sesión con tu cuenta de Google.</p>
      </div>
      <p class="text-sm text-amber-200">
        Primero vincula Google desde Wallet Payment Tracker en Android. Ingresar aquí antes puede crear otro usuario sin tus pagos existentes.
      </p>
      <label class="flex items-start gap-3 text-sm text-slate-200">
        <input v-model="linkedOnAndroid" type="checkbox" class="mt-1 h-4 w-4" :disabled="auth.busy.value">
        Ya vinculé esta cuenta de Google en Android y confirmé que conserva mi usuario.
      </label>
      <p v-if="auth.error.value" role="alert" class="text-sm text-rose-300">{{ auth.error.value }}</p>
      <UButton v-if="auth.logoutUnconfirmed.value" block :loading="auth.busy.value" @click="retryLogout">
        Reintentar cierre de sesión
      </UButton>
      <UButton v-else block :loading="auth.busy.value" :disabled="!linkedOnAndroid || auth.busy.value" @click="login">
        Continuar con Google
      </UButton>
      <UButton v-if="auth.error.value && !auth.logoutUnconfirmed.value" block variant="ghost" :disabled="auth.busy.value" @click="retrySession">
        Comprobar sesión nuevamente
      </UButton>
    </section>
  </main>
</template>
