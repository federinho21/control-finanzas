<script setup lang="ts">
const route = useRouter().currentRoute
const auth = useAuth()
// Force dark mode: sets the `dark` class on <html> and pins the color mode so
// the night palette is applied on both SSR and client.
const colorMode = useColorMode()
colorMode.preference = 'dark'
if (import.meta.client) {
  document.documentElement.classList.add('dark')
}

useHead({
  htmlAttrs: {
    class: 'dark',
  },
  bodyAttrs: {
    style: 'background-color:#000000;',
  },
})
</script>

<template>
  <div class="app-shell">
    <AppSidebar v-if="auth.user.value && route.path !== '/login'" class="hidden lg:flex" />
    <div class="app-main" :class="{ 'is-login': route.path === '/login' }">
      <NuxtPage v-if="route.path === '/login' || (auth.ready.value && auth.user.value)" :key="auth.user.value?.uid ?? 'signed-out'" />
      <p v-else role="status" class="p-6 text-slate-300">Comprobando sesión…</p>
    </div>
    <MobileNav v-if="auth.user.value && route.path !== '/login'" class="lg:hidden" />
  </div>
</template>

<style>
.app-shell {
  display: flex;
  height: 100dvh;
  overflow: hidden;
  background: var(--ui-bg);
}

.app-main {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

@media (max-width: 1023px) {
  .app-main:not(.is-login) {
    padding-bottom: 64px;
  }
}
</style>
