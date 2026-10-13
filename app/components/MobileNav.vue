<script setup lang="ts">
const route = useRoute()
const auth = useAuth()
async function logout() {
  await auth.logout()
  await navigateTo('/login')
}

const navItems = [
  { label: 'IA', icon: 'i-lucide-message-square', to: '/' },
  { label: 'Finanzas', icon: 'i-lucide-wallet', to: '/finanzas' },
  { label: 'Dashboard', icon: 'i-lucide-bar-chart-2', to: '/dashboard' },
]

function isActive(to: string) {
  return route.path === to || route.path.startsWith(to + '/')
}
</script>

<template>
  <nav class="fixed bottom-0 left-0 right-0 z-40 flex justify-around items-center glass-panel rounded-none border-b-0 border-l-0 border-r-0 px-2 py-1.5">
    <NuxtLink
      v-for="item in navItems"
      :key="item.to"
      :to="item.to"
      class="flex flex-col items-center gap-0.5 py-1.5 px-4 rounded-xl no-underline text-slate-400 hover:text-white transition-colors"
      :class="{ 'text-primary-300': isActive(item.to) }"
    >
      <UIcon :name="item.icon" class="w-5 h-5 shrink-0" />
      <span class="text-[0.6rem] font-semibold tracking-wide">{{ item.label }}</span>
    </NuxtLink>
    <UButton icon="i-lucide-log-out" variant="ghost" aria-label="Cerrar sesión" :loading="auth.busy.value" @click="logout" />
  </nav>
</template>
