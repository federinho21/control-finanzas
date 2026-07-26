<script setup lang="ts">
const route = useRoute()
const { isDark, toggle, init } = useTheme()

// Initializes the theme when the component is mounted to the DOM
onMounted(() => {
  init()
})

const navItems = [
  { label: 'Assistant', icon: 'i-lucide-message-square', to: '/' },
  { label: 'Dashboard', icon: 'i-lucide-bar-chart-2', to: '/dashboard' },
]
</script>

<template>
  <nav class="flex flex-col w-20 h-dvh bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 py-3 items-center shrink-0">
    <div class="flex flex-col items-center gap-0.5 pb-4 border-b border-slate-200 dark:border-slate-700 w-full mb-2">
      <span class="text-2xl leading-none">🪨</span>
      <span class="text-[0.55rem] font-bold tracking-widest uppercase text-slate-400">RockPlan</span>
    </div>

    <ul class="list-none m-0 flex flex-col gap-1 flex-1 w-full px-2">
      <li v-for="item in navItems" :key="item.to">
        <NuxtLink
          :to="item.to"
          class="flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg no-underline text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
          :class="{ 'bg-blue-50 dark:bg-blue-950 text-blue-500 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-500 dark:hover:text-blue-400': route.path === item.to || route.path.startsWith(item.to + '/') }"
        >
          <UIcon :name="item.icon" class="w-5 h-5 shrink-0" />
          <span class="text-[0.65rem] font-semibold tracking-wide">{{ item.label }}</span>
        </NuxtLink>
      </li>
    </ul>

    <div class="pt-3 border-t border-slate-200 dark:border-slate-700 w-full flex justify-center mt-2 px-2">
      <button
        class="flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 text-slate-400 hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-500 hover:border-blue-300 transition-colors cursor-pointer"
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

