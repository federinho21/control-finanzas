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

// Custom core rule: transforms R-XXXX / S-XXXX / T-XXXX / U-XXXX tokens into clickable spans
md.core.ruler.push('entity_ids', (state: any) => {
  const ID_RE = /\b([RSTU]-[A-Z0-9]{4})\b/g

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
        const prefix = id[0]
        const entityType = prefix === 'R' ? 'account' : prefix === 'S' ? 'period' : prefix === 'U' ? 'cuota' : 'movement'
        const query = `Give me full details about ${entityType} ${id}`

        const chip = new state.Token('html_inline', '', 0)
        const chipClasses = entityType === 'account'
          ? 'bg-blue-500/15 text-blue-300 hover:bg-blue-500/25'
          : entityType === 'period'
            ? 'bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25'
            : entityType === 'cuota'
              ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
              : 'bg-violet-500/15 text-violet-300 hover:bg-violet-500/25'
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
  if (role === 'user') return 'bg-gradient-to-br from-zinc-600 to-zinc-800 text-white rounded-2xl rounded-br-sm ml-auto shadow-lg shadow-black/30'
  if (role === 'error') return 'bg-rose-500/15 border border-rose-400/40 text-rose-200 rounded-2xl rounded-bl-sm'
  if (role === 'warning') return 'bg-amber-500/15 border border-amber-400/40 text-amber-200 rounded-2xl rounded-bl-sm'
  if (role === 'status') return 'bg-slate-400/10 border border-dashed border-slate-400/30 text-slate-400 rounded-2xl rounded-bl-sm text-sm'
  if (role === 'judge') return 'bg-amber-500/15 border border-amber-400/40 text-amber-200 rounded-2xl rounded-bl-sm'
  if (role === 'guardrail') return 'bg-rose-500/15 border border-rose-400/40 text-rose-200 rounded-2xl rounded-bl-sm'
  // assistant default — night glass bubble
  return 'bg-white/6 border border-white/10 text-slate-100 rounded-2xl rounded-bl-sm backdrop-blur-xl'
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
    <div :class="['max-w-[78%] px-3.5 py-2.5 shadow-sm', bubbleClasses, { 'animate-welcome': message.isWelcome }]">
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
          class="border border-white/10 rounded-xl p-2.5 bg-white/5">
          <div class="flex items-center gap-2 mb-2">
            <USwitch v-model="task.selected" />
            <span class="text-sm text-slate-400 font-medium">Include</span>
          </div>
          <UInput v-model="task.description" class="w-full" placeholder="Movement description" />
          <div class="grid gap-2 mt-2" style="grid-template-columns: 1fr 120px 130px 140px;">
            <UInput v-model="task.owner" placeholder="Category" />
            <UInput v-model="task.monto" placeholder="Amount" type="number" />
            <USelect v-model="task.tipo"
              :items="[{ label: 'Ingreso', value: 'ingreso' }, { label: 'Gasto', value: 'gasto' }, { label: 'Retiro', value: 'retiro' }]"
              value-key="value" placeholder="Type" />
            <USelect v-model="task.priority"
              :items="[{ label: 'High', value: 'high' }, { label: 'Medium', value: 'medium' }, { label: 'Low', value: 'low' }]"
              value-key="value" placeholder="Priority" />
          </div>
          <UPopover class="mt-2">
            <UButton variant="outline" color="neutral" icon="i-lucide-calendar" class="w-full justify-start">
              {{ task.deadline || 'Pick date' }}
            </UButton>
            <template #content>
              <UCalendar :model-value="toCalendarDate(task.deadline)"
                @update:model-value="(val: any) => { if (val) task.deadline = fromCalendarDate(val) }" />
            </template>
          </UPopover>
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
