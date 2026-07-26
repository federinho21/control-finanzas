<script setup lang="ts">
import type { ChatMessage, UiAction } from '~~/shared/types/chat'
import type { ProposedTask } from '~~/shared/types/task'
import { normalizeDateToDb } from '~~/shared/utils/date'
import { CalendarDate } from '@internationalized/date'
import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'

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

const props = defineProps<{
  message: ChatMessage
  disableIdLinks?: boolean
}>()

const emit = defineEmits<{
  action: [payload: { action: UiAction; editedTasks?: ProposedTask[] }]
  queryId: [query: string]
}>()



const md = new MarkdownIt({ html: false, linkify: false, typographer: false })

// Custom core rule: transforms R-XXXX / S-XXXX / T-XXXX tokens into clickable spans
md.core.ruler.push('entity_ids', (state: any) => {
  const ID_RE = /\b([RST]-[A-Z0-9]{4})\b/g

  for (const blockToken of state.tokens) {
    if (blockToken.type !== 'inline' || !blockToken.children) continue

    const newChildren: Token[] = []
    for (const token of blockToken.children) {
      if (token.type !== 'text') {
        newChildren.push(token)
        continue
      }

      const text = token.content
      let last = 0
      let match: RegExpExecArray | null
      ID_RE.lastIndex = 0

      while ((match = ID_RE.exec(text)) !== null) {
        if (match.index > last) {
          const t = new state.Token('text', '', 0)
          t.content = text.slice(last, match.index)
          newChildren.push(t)
        }

        const id = match[1]!
        const entityType = id.startsWith('R') ? 'rock' : id.startsWith('S') ? 'sprint' : 'task'
        const query = `Give me full details about ${entityType} ${id}`

        const chip = new state.Token('html_inline', '', 0)
        // Set specific chip colors for each entity type (Rock: blue, Sprint: cyan, Task: violet) 
        // to match the visual styling used elsewhere like the Quarter Board cards.
        const chipClasses = entityType === 'rock'
          ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800'
          : entityType === 'sprint'
            ? 'bg-cyan-50 dark:bg-cyan-950 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-900'
            : 'bg-violet-50 dark:bg-violet-950 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900'
        chip.content = `<span class="inline-flex items-center font-mono font-semibold text-xs px-1.5 py-0.5 rounded cursor-pointer transition-colors ${chipClasses}" data-query="${query}">${id}</span>`
        newChildren.push(chip)

        last = match.index + match[0].length
      }

      if (last < text.length) {
        const t = new state.Token('text', '', 0)
        t.content = text.slice(last)
        newChildren.push(t)
      }
    }
    blockToken.children = newChildren
  }
})

function renderMarkdown(text: string): string {
  return md.render(text)
}

function onMarkdownClick(e: MouseEvent) {
  if (props.disableIdLinks) return
  const target = (e.target as HTMLElement).closest('[data-query]')
  if (target) {
    const query = (target as HTMLElement).dataset.query
    if (query) emit('queryId', query)
  }
}

// Keeps task dates in user-friendly format while preserving all other fields.
function normalizeTaskForEditing(task: ProposedTask): ProposedTask {
  try {
    return {
      ...task,
      deadline: normalizeDateToDb(task.deadline)
    }
  } catch {
    return task
  }
}

const editableTasks = ref<ProposedTask[]>(
  props.message.proposedTasks
    ? JSON.parse(JSON.stringify(props.message.proposedTasks)).map(normalizeTaskForEditing)
    : []
)

// Maps legacy action color values to Nuxt UI button colors without changing action semantics.
function mapActionColor(color?: string): 'success' | 'error' | 'neutral' {
  if (color === 'success') {
    return 'success'
  }

  if (color === 'error') {
    return 'error'
  }

  return 'neutral'
}

// Chooses a semantic button icon from the action type while keeping labels visible.
function mapActionIcon(action: UiAction): string | undefined {
  if (action.type === 'approve_plan' || action.type === 'approve_tasks') {
    return 'i-lucide-check-circle-2'
  }

  return undefined
}

const bubbleClasses = computed(() => {
  const role = props.message.role
  if (role === 'user') return 'bg-blue-500 dark:bg-blue-400 text-white dark:text-slate-900 rounded-2xl rounded-br-sm ml-auto'
  if (role === 'error') return 'bg-red-100 dark:bg-red-950 border border-red-300 dark:border-red-700 text-red-900 dark:text-red-300 rounded-2xl rounded-bl-sm'
  if (role === 'warning') return 'bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-700 text-amber-900 dark:text-amber-300 rounded-2xl rounded-bl-sm'
  if (role === 'status') return 'bg-slate-50 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500 rounded-2xl rounded-bl-sm text-sm'
  if (role === 'judge') return 'bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 rounded-2xl rounded-bl-sm'
  if (role === 'guardrail') return 'bg-red-50 dark:bg-red-950/50 border border-red-300 dark:border-red-700 text-red-900 dark:text-red-200 rounded-2xl rounded-bl-sm'
  // assistant default
  return 'bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-2xl rounded-bl-sm'
})

const rowClasses = computed(() => {
  return props.message.role === 'user' ? 'flex w-full justify-end' : 'flex w-full justify-start'
})

// Ensures that action is sent completely
function onAction(action: UiAction) {
  if (action.type === 'approve_tasks') {
    emit('action', { action, editedTasks: editableTasks.value })
    return
  }

  emit('action', { action })
}
</script>

<template>
  <div :class="rowClasses">
    <div :class="['max-w-[78%] px-3.5 py-2.5 shadow-sm', bubbleClasses]">
      <UIcon v-if="message.role === 'judge'" name="i-lucide-alert-triangle"
        class="inline-block w-4 h-4 mr-1.5 mb-1 text-amber-500 shrink-0" />
      <UIcon v-if="message.role === 'guardrail'" name="i-lucide-shield-alert"
        class="inline-block w-4 h-4 mr-1.5 mb-1 text-red-500 shrink-0" />

      <!-- For non-user, non-status messages: render markdown with ID chips -->
      <div v-if="message.role !== 'user' && message.role !== 'status'"
        class="prose-chat text-sm leading-relaxed [&_p]:my-1.5 [&_p:last-child]:mb-0 [&_ul]:my-1.5 [&_ul]:pl-5 [&_li]:my-0.5 [&_strong]:font-semibold [&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-2 [&_h1]:mb-1 [&_h2]:text-sm [&_h2]:font-bold [&_h2]:mt-2 [&_h2]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-1.5 [&_h3]:mb-0.5 [&_code]:font-mono [&_code]:text-xs [&_code]:bg-black/10 [&_code]:dark:bg-white/10 [&_code]:px-1 [&_code]:rounded"
        v-html="renderMarkdown(message.content)" @click="onMarkdownClick" />
      <!-- For user and status messages: plain text -->
      <p v-else class="m-0 whitespace-pre-wrap leading-relaxed text-sm">{{ message.content }}</p>

      <div v-if="editableTasks.length" class="mt-3 flex flex-col gap-2.5">
        <div v-for="(task, index) in editableTasks" :key="index"
          class="border border-slate-200 dark:border-slate-600 rounded-xl p-2.5 bg-white dark:bg-slate-800">
          <div class="flex items-center gap-2 mb-2">
            <USwitch v-model="task.selected" />
            <span class="text-sm text-slate-500 dark:text-slate-400 font-medium">Include</span>
          </div>
          <UInput v-model="task.description" class="w-full" placeholder="Task description" />
          <div class="grid gap-2 mt-2" style="grid-template-columns: 1fr 180px 140px;">
            <UInput v-model="task.owner" placeholder="Owner" />
            <UPopover>
              <UButton variant="outline" color="neutral" icon="i-lucide-calendar" class="w-full justify-start">
                {{ task.deadline || 'Pick date' }}
              </UButton>
              <template #content>
                <UCalendar :model-value="toCalendarDate(task.deadline)"
                  @update:model-value="(val: any) => { if (val) task.deadline = fromCalendarDate(val) }" />
              </template>
            </UPopover>
            <USelect v-model="task.priority"
              :items="[{ label: 'High', value: 'high' }, { label: 'Medium', value: 'medium' }, { label: 'Low', value: 'low' }]"
              value-key="value" placeholder="Priority" />
          </div>
        </div>
      </div>

      <div v-if="message.actions?.length" class="flex flex-wrap gap-2 mt-3">
        <UButton v-for="item in message.actions" :key="item.actionId + item.label" :color="mapActionColor(item.color)"
          :variant="mapActionColor(item.color) === 'neutral' ? 'soft' : 'solid'" :icon="mapActionIcon(item)"
          @click="onAction(item)">
          {{ item.label }}
        </UButton>
      </div>
    </div>
  </div>
</template>
