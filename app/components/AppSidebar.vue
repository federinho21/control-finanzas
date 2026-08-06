<script setup lang="ts">
const route = useRoute()
const { isDark, toggle, init } = useTheme()

// Initializes the theme when the component is mounted to the DOM
onMounted(() => {
  init()
})

const navItems = [
  { label: 'IA', icon: 'i-lucide-message-square', to: '/' },
  { label: 'Finanzas', icon: 'i-lucide-wallet', to: '/finanzas' },
  { label: 'Dashboard', icon: 'i-lucide-bar-chart-2', to: '/dashboard' },
]
</script>

<template>
  <nav class="flex flex-col w-20 h-dvh py-3 items-center shrink-0 glass-panel border-r-0 rounded-none">
    <div class="flex flex-col items-center gap-0.5 pb-4 w-full mb-2">
      <span class="text-2xl leading-none">💠</span>
      <span class="text-[0.55rem] font-bold tracking-widest uppercase text-slate-400">Finance</span>
    </div>

    <ul class="list-none m-0 flex flex-col gap-1 flex-1 w-full px-2">
      <li v-for="item in navItems" :key="item.to">
        <NuxtLink
          :to="item.to"
          class="flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg no-underline text-slate-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          :class="{ 'bg-primary/20 text-primary-300 hover:bg-primary/25 hover:text-primary-200': route.path === item.to || route.path.startsWith(item.to + '/') }"
        >
          <UIcon :name="item.icon" class="w-5 h-5 shrink-0" />
          <span class="text-[0.65rem] font-semibold tracking-wide">{{ item.label }}</span>
        </NuxtLink>
      </li>
    </ul>

    <div class="pt-3 w-full flex justify-center mt-2 px-2">
      <button
        class="flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200/20 bg-white/10 text-slate-300 hover:bg-primary/20 hover:text-primary-200 transition-colors cursor-pointer"
        :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
        @click="toggle"
      >
        <ClientOnly>
          <UIcon :name="isDark ? 'i-lucide-sun' : 'i-lucide-moon'" class="w-4 h-4" />
          <template #fallback>
            <span class="w-4 h-4 block" />
          </template>
        </ClientOnly>
      </button>
    </div>
  </nav>
</template>
