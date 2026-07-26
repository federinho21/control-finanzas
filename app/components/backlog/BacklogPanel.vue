<script setup lang="ts">
import RockCard from './RockCard.vue'
import SprintCard from './SprintCard.vue'
import TaskCard from './TaskCard.vue'

const tab = ref<'rocks' | 'sprints' | 'tasks'>('rocks')
const { rocks, sprints, tasks, loading, refreshBacklog } = useBacklog()

onMounted(async () => {
  await refreshBacklog()
})
</script>

<template>
  <section class="flex flex-col h-full min-h-0">
    <div class="shrink-0 flex flex-col gap-3 pb-3 border-b border-slate-200 dark:border-slate-700">
      <div class="flex justify-end">
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-refresh-cw"
          size="sm"
          :loading="loading"
          @click="refreshBacklog"
        >
          {{ loading ? 'Refreshing...' : 'Refresh' }}
        </UButton>
      </div>

      <div class="flex gap-2" role="group" aria-label="Backlog sections">
        <UButton
          :color="tab === 'rocks' ? 'primary' : 'neutral'"
          :variant="tab === 'rocks' ? 'solid' : 'ghost'"
          icon="i-lucide-mountain"
          size="sm"
          @click="tab = 'rocks'"
        >
          Rocks
        </UButton>
        <UButton
          :color="tab === 'sprints' ? 'primary' : 'neutral'"
          :variant="tab === 'sprints' ? 'solid' : 'ghost'"
          icon="i-lucide-timer"
          size="sm"
          @click="tab = 'sprints'"
        >
          Sprints
        </UButton>
        <UButton
          :color="tab === 'tasks' ? 'primary' : 'neutral'"
          :variant="tab === 'tasks' ? 'solid' : 'ghost'"
          icon="i-lucide-check-square"
          size="sm"
          @click="tab = 'tasks'"
        >
          Tasks
        </UButton>
      </div>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto pt-3">
      <div v-if="tab === 'rocks'" class="flex flex-col gap-3 pl-3 pr-3">
        <RockCard v-for="rock in rocks" :key="rock.id" :rock="rock" />
        <div v-if="!rocks.length" class="border border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-6 text-center bg-slate-50 dark:bg-slate-800/50">
          <p class="font-semibold text-slate-700 dark:text-slate-300 m-0">No rocks yet.</p>
          <p class="text-sm text-slate-400 dark:text-slate-500 mt-1 m-0">Ask the assistant to create your first quarterly rock.</p>
        </div>
      </div>

      <div v-else-if="tab === 'sprints'" class="flex flex-col gap-3 pl-3 pr-3">
        <SprintCard v-for="sprint in sprints" :key="sprint.id" :sprint="sprint" />
        <div v-if="!sprints.length" class="border border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-6 text-center bg-slate-50 dark:bg-slate-800/50">
          <p class="font-semibold text-slate-700 dark:text-slate-300 m-0">No sprints yet.</p>
          <p class="text-sm text-slate-400 dark:text-slate-500 mt-1 m-0">Generate a plan to break your rock into sprint increments.</p>
        </div>
      </div>

      <div v-else class="flex flex-col gap-3 pl-3 pr-3">
        <TaskCard v-for="task in tasks" :key="task.id" :task="task" />
        <div v-if="!tasks.length" class="border border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-6 text-center bg-slate-50 dark:bg-slate-800/50">
          <p class="font-semibold text-slate-700 dark:text-slate-300 m-0">No tasks yet.</p>
          <p class="text-sm text-slate-400 dark:text-slate-500 mt-1 m-0">Approve a sprint proposal to populate executable tasks.</p>
        </div>
      </div>
    </div>
  </section>
</template>
