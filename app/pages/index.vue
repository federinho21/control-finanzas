<template>
  <main class="h-full grid gap-4 p-4" style="grid-template-columns: 60fr 40fr;">
    <div class="flex flex-col min-h-0 border border-slate-200 dark:border-slate-700 rounded-2xl bg-white dark:bg-slate-800 p-4">
      <ChatPanel />
    </div>

    <aside class="flex flex-col min-h-0 border border-slate-200 dark:border-slate-700 rounded-2xl bg-white dark:bg-slate-800 p-4 gap-4">
      <header class="shrink-0 flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-4">
        <h2 class="m-0 text-xl font-semibold text-slate-900 dark:text-slate-100">Quarter Board</h2>
        <div class="flex gap-2" role="group" aria-label="Backlog views">
          <UButton
            to="/"
            :color="route.path === '/' ? 'primary' : 'neutral'"
            :variant="route.path === '/' ? 'solid' : 'soft'"
            icon="i-lucide-layout-list"
            size="sm"
          >
            Current Backlog
          </UButton>
          <UButton
            v-if="hasPlan"
            to="/preview"
            :color="route.path === '/preview' ? 'primary' : 'neutral'"
            :variant="route.path === '/preview' ? 'solid' : 'soft'"
            icon="i-lucide-clipboard-check"
            size="sm"
          >
            Proposed Plan
          </UButton>
        </div>
      </header>

      <div class="flex-1 min-h-0 flex flex-col">
        <NuxtPage />
      </div>
    </aside>
  </main>
</template>

<script setup lang="ts">
import ChatPanel from "~/components/chat/ChatPanel.vue";

const route = useRoute();
const { hasPlan } = usePlanPreview();
</script>

