<script setup lang="ts">
import type { ProposedPlan, ProposedSprint } from '~~/shared/types/plan'
import type { ProposedTask } from '~~/shared/types/task'
import { normalizeDateToDb } from '~~/shared/utils/date'
import { CalendarDate } from '@internationalized/date'

// Convierte string YYYY-MM-DD a CalendarDate (requerido para el date picker)
function toCalendarDate(dateStr?: string | null): CalendarDate | undefined {
  if (!dateStr) return undefined
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return undefined
  return new CalendarDate(y, m, d)
}

// Convierte CalendarDate a string YYYY-MM-DD para el estado de la app
function fromCalendarDate(date: CalendarDate): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
}

// Converts YYYY-MM-DD to MM/DD/YYYY for display in date picker buttons.
function displayDate(dateStr?: string | null): string {
  if (!dateStr) return 'Pick date'
  const [y, m, d] = dateStr.split('-')
  if (!y || !m || !d) return dateStr
  return `${m}/${d}/${y}`
}

// Today as CalendarDate — used as minimum selectable date across all pickers.
const today = computed(() => {
  const now = new Date()
  return new CalendarDate(now.getFullYear(), now.getMonth() + 1, now.getDate())
})

const { plan, actionId, tempId, hasPlan, clearPlan } = usePlanPreview()
const { submitAction, pending } = useChat()

const editablePlan = ref<ProposedPlan | null>(null)

// Keeps an isolated editable copy so users can adjust fields before approval.
function clonePlan(input: ProposedPlan): ProposedPlan {
  const clone = JSON.parse(JSON.stringify(input)) as ProposedPlan
  // Normalize all dates to YYYY-MM-DD for <input type="date"> compatibility
  try { clone.rock.deadline = normalizeDateToDb(clone.rock.deadline) } catch { /* keep as-is */ }
  for (const sprint of clone.sprints) {
    try { sprint.startDate = normalizeDateToDb(sprint.startDate) } catch { /* keep as-is */ }
    try { sprint.endDate = normalizeDateToDb(sprint.endDate) } catch { /* keep as-is */ }
    for (const task of sprint.tasks) {
      try { task.deadline = normalizeDateToDb(task.deadline) } catch { /* keep as-is */ }
    }
  }
  return clone
}

// Retorna un nuevo sprint vacío para inicializar las propiedades
function newSprint(): ProposedSprint {
  return { name: '', startDate: '', endDate: '', tasks: [] }
}

// Retorna una nueva tarea vacía para inicializar las propiedades
function newTask(): ProposedTask {
  return { description: '', owner: '', deadline: '', priority: 'medium', selected: true, monto: '0.00', tipo: 'gasto' }
}

watch(
  plan,
  (value) => {
    editablePlan.value = value ? clonePlan(value) : null
  },
  { immediate: true }
)

// Cancels preview mode and returns to the main finance view.
async function onCancel() {
  const currentTempId = tempId.value
  clearPlan()

  // Remove the provisional document so it is not left orphaned in the database.
  if (currentTempId) {
    await $fetch(`/api/documents/${currentTempId}`, { method: 'DELETE' }).catch(() => {})
  }

  await navigateTo('/finanzas')
}

// Submits the edited plan through the existing approve_plan action flow.
async function onApprove() {
  if (!editablePlan.value || !actionId.value) {
    return
  }

  const success = await submitAction(
    {
      type: 'approve_plan',
      actionId: actionId.value
    },
    undefined,
    editablePlan.value
  )

  if (success) {
    clearPlan()
    await navigateTo('/finanzas')
  }
}
</script>

<template>
  <main class="h-full p-3 sm:p-4">
    <section class="glass-panel h-full flex flex-col min-h-0 overflow-y-scroll overflow-x-hidden">
      <template v-if="hasPlan && editablePlan">
        <div class="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4 py-4 px-3 sm:px-4">
          <UCard :ui="{ body: 'flex flex-col gap-2.5' }">
            <header>
              <h3 class="m-0 text-lg font-semibold text-slate-100">Budget Plan Preview</h3>
              <p class="mt-1.5 text-sm text-slate-400">Edita la propuesta antes de aprobarla.</p>
            </header>
          </UCard>

          <UCard :ui="{ body: 'flex flex-col gap-2.5' }">
            <h4 class="m-0 text-base font-semibold text-slate-100">Account</h4>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <label class="flex flex-col gap-1.5 sm:col-span-2">
                <span class="text-xs font-semibold text-slate-400">Name</span>
                <UInput v-model="editablePlan.rock.name" type="text" placeholder="Account name" class="w-full" />
              </label>

              <label class="flex flex-col gap-1.5 sm:col-span-2">
                <span class="text-xs font-semibold text-slate-400">Description</span>
                <UTextarea v-model="editablePlan.rock.description" class="w-full" :rows="3" placeholder="Account description" data-gramm="false" data-gramm_editor="false" />
              </label>

              <label class="flex flex-col gap-1.5">
                <span class="text-xs font-semibold text-slate-400">Deadline</span>
                <UPopover class="w-full">
                  <UButton
                    variant="outline"
                    color="neutral"
                    icon="i-lucide-calendar"
                    class="w-full justify-start"
                  >
                    {{ displayDate(editablePlan.rock.deadline) }}
                  </UButton>
                  <template #content>
                    <UCalendar
                      :model-value="toCalendarDate(editablePlan.rock.deadline)"
                      :min-value="today"
                      @update:model-value="(val: any) => { if (val && editablePlan) editablePlan.rock.deadline = fromCalendarDate(val) }"
                    />
                  </template>
                </UPopover>
              </label>
            </div>
          </UCard>

          <UCard :ui="{ body: 'flex flex-col gap-2.5' }" v-for="(sprint, sprintIndex) in editablePlan.sprints" :key="sprintIndex">
            <div class="flex items-center justify-between">
              <h4 class="m-0 text-base font-semibold text-slate-100">Period {{ sprintIndex + 1 }}</h4>
              <UButton
                v-if="editablePlan.sprints.length > 1"
                color="error"
                variant="ghost"
                size="xs"
                icon="i-lucide-trash-2"
                @click="editablePlan.sprints.splice(sprintIndex, 1)"
              >Remove Period</UButton>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <label class="flex flex-col gap-1.5 sm:col-span-2">
                <span class="text-xs font-semibold text-slate-400">Name</span>
                <UInput v-model="sprint.name" type="text" placeholder="Period name" class="w-full" />
              </label>

              <label class="flex flex-col gap-1.5">
                <span class="text-xs font-semibold text-slate-400">Start Date</span>
                <UPopover class="w-full">
                  <UButton
                    variant="outline"
                    color="neutral"
                    icon="i-lucide-calendar"
                    class="w-full justify-start"
                  >
                    {{ displayDate(sprint.startDate) }}
                  </UButton>
                  <template #content>
                    <UCalendar
                      :model-value="toCalendarDate(sprint.startDate)"
                      @update:model-value="(val: any) => { if (val) sprint.startDate = fromCalendarDate(val) }"
                    />
                  </template>
                </UPopover>
              </label>

              <label class="flex flex-col gap-1.5">
                <span class="text-xs font-semibold text-slate-400">End Date</span>
                <UPopover class="w-full">
                  <UButton
                    variant="outline"
                    color="neutral"
                    icon="i-lucide-calendar"
                    class="w-full justify-start"
                  >
                    {{ displayDate(sprint.endDate) }}
                  </UButton>
                  <template #content>
                    <UCalendar
                      :model-value="toCalendarDate(sprint.endDate)"
                      @update:model-value="(val: any) => { if (val) sprint.endDate = fromCalendarDate(val) }"
                    />
                  </template>
                </UPopover>
              </label>
            </div>

            <div class="flex flex-col gap-2.5 mt-2.5">
              <UCard :ui="{ body: 'flex flex-col gap-2' }" v-for="(task, taskIndex) in sprint.tasks" :key="`${sprintIndex}-${taskIndex}`">
                <div class="flex items-center gap-2 mb-3">
                  <USwitch v-model="task.selected" />
                  <span class="text-sm text-slate-400 font-medium">Include</span>
                </div>

                <label class="flex flex-col gap-1.5 sm:col-span-2">
                  <span class="text-xs font-semibold text-slate-400">Description</span>
                  <UInput v-model="task.description" type="text" placeholder="Movement description" class="w-full" />
                </label>

                <div class="grid gap-2 mt-2 grid-cols-1 sm:grid-cols-2 xl:grid-cols-5">
                  <label class="flex flex-col gap-1.5">
                    <span class="text-xs font-semibold text-slate-400">Category</span>
                    <UInput v-model="task.owner" type="text" placeholder="Category" class="w-full" />
                  </label>

                  <label class="flex flex-col gap-1.5">
                    <span class="text-xs font-semibold text-slate-400">Amount</span>
                    <UInput v-model="task.monto" type="number" step="0.01" placeholder="0.00" class="w-full" />
                  </label>

                  <label class="flex flex-col gap-1.5">
                    <span class="text-xs font-semibold text-slate-400">Type</span>
                    <USelect
                      v-model="task.tipo"
                      :items="[{ label: 'Ingreso', value: 'ingreso' }, { label: 'Gasto', value: 'gasto' }, { label: 'Retiro', value: 'retiro' }]"
                      value-key="value"
                      class="w-full"
                    />
                  </label>

                  <label class="flex flex-col gap-1.5">
                    <span class="text-xs font-semibold text-slate-400">Priority</span>
                    <USelect
                      v-model="task.priority"
                      :items="[{ label: 'High', value: 'high' }, { label: 'Medium', value: 'medium' }, { label: 'Low', value: 'low' }]"
                      value-key="value"
                      class="w-full"
                    />
                  </label>

                  <label class="flex flex-col gap-1.5">
                    <span class="text-xs font-semibold text-slate-400">Deadline</span>
                    <UPopover class="w-full">
                      <UButton
                        variant="outline"
                        color="neutral"
                        icon="i-lucide-calendar"
                        class="w-full justify-start"
                      >
                        {{ displayDate(task.deadline) }}
                      </UButton>
                      <template #content>
                        <UCalendar
                          :model-value="toCalendarDate(task.deadline)"
                          :min-value="today"
                          :max-value="toCalendarDate(sprint.endDate)"
                          @update:model-value="(val: any) => { if (val) task.deadline = fromCalendarDate(val) }"
                        />
                      </template>
                    </UPopover>
                  </label>
                </div>
              </UCard>
            </div>
            <UButton
              color="neutral"
              variant="soft"
              size="xs"
              icon="i-lucide-plus"
              class="mt-1 self-start"
              @click="sprint.tasks.push(newTask())"
            >Add Movement</UButton>
          </UCard>

          <div class="flex justify-center py-2">
            <UButton
              color="neutral"
              variant="soft"
              icon="i-lucide-plus"
              @click="editablePlan.sprints.push(newSprint())"
            >Add Period</UButton>
          </div>
        </div>

        <footer class="shrink-0 flex justify-end gap-2 pt-4 border-t border-slate-200 px-3 sm:px-4">
          <UButton color="neutral" variant="soft" icon="i-lucide-ban" :disabled="pending" @click="onCancel">Cancel</UButton>
          <UButton color="success" icon="i-lucide-check-circle-2" :disabled="pending" @click="onApprove">
            {{ pending ? 'Approving...' : 'Approve Budget' }}
          </UButton>
        </footer>
      </template>

      <template v-else>
        <UCard>
          <div class="mx-auto max-w-sm text-center flex flex-col gap-2">
            <h3 class="m-0 text-lg font-semibold text-slate-100">No proposed budget available</h3>
            <p class="m-0 text-sm text-slate-400">Ask the assistant for a budget plan to open preview mode.</p>
            <UButton color="neutral" variant="soft" icon="i-lucide-arrow-left" @click="navigateTo('/finanzas')">Back to finances</UButton>
          </div>
        </UCard>
      </template>
    </section>
  </main>
</template>
