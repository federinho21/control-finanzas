<script setup lang="ts">
import type { UiAction } from '~~/shared/types/chat'
import type { ProposedTask } from '~~/shared/types/task'
import ChatInput from './ChatInput.vue'
import ChatMessage from './ChatMessage.vue'

const { messages, pending, sendMessage, submitAction } = useChat()
const { pendingQuery, consumeQuery } = useChatQuery()
const input = ref('')
const messagesRef = ref<HTMLElement | null>(null)
const autoScrollArmed = ref(true)
const chatInputRef = ref<{ focus: () => void } | null>(null)

const AUTO_SCROLL_THRESHOLD = 88

const latestMessageSignature = computed(() => {
  const last = messages.value.at(-1)

  if (!last) {
    return 'empty'
  }

  return [
    messages.value.length,
    last.id,
    last.role,
    last.content.length,
    last.actions?.length ?? 0,
    last.proposedTasks?.length ?? 0
  ].join(':')
})

// Checks if the user is close enough to the bottom so auto-scroll does not interrupt manual reading.
function isNearBottom(element: HTMLElement) {
  const distance = element.scrollHeight - element.scrollTop - element.clientHeight
  return distance <= AUTO_SCROLL_THRESHOLD
}

// Schedules a smooth bottom snap after DOM updates during regular and streaming message changes.
async function scrollToBottom() {
  const container = messagesRef.value
  if (!container) {
    return
  }

  await nextTick()

  requestAnimationFrame(() => {
    const current = messagesRef.value
    if (!current) {
      return
    }

    current.scrollTop = current.scrollHeight
  })
}

// Tracks whether auto-scroll should remain active based on current user scroll position.
function onMessagesScroll(event: Event) {
  const target = event.target as HTMLElement
  autoScrollArmed.value = isNearBottom(target)
}

async function onSend() {
  const text = input.value
  input.value = ''
  await nextTick()
  chatInputRef.value?.focus()
  await sendMessage(text)
}

function onUploaded(payload: { filename: string; chunks: number }) {
  messages.value.push({
    id: crypto.randomUUID(),
    role: 'assistant',
    content: `**${payload.filename}** has been processed and is ready to use. Here's what you can do:\n- Ask questions about the document content\n- Ask me to generate a plan based on it\n- Reference it when reviewing strategy decisions`,
    createdAt: new Date().toISOString()
  })
}

function onUploadError(message: string) {
  messages.value.push({
    id: crypto.randomUUID(),
    role: 'error',
    content: `File upload error: ${message}`,
    createdAt: new Date().toISOString()
  })
}

async function onAction(payload: { action: UiAction; editedTasks?: ProposedTask[] }) {
  await submitAction(
    {
      type: payload.action.type,
      actionId: payload.action.actionId,
      payload: payload.action.payload
    },
    payload.editedTasks
  )
}

// Recibe una consulta, la coloca en el campo de entrada y la envía automáticamente.
async function onQueryId(query: string) {
  input.value = query
  autoScrollArmed.value = true
  await scrollToBottom()
  await onSend()
}

onMounted(() => {
  void scrollToBottom()
})

watch(pendingQuery, async (val) => {
  if (!val) return
  const query = consumeQuery()
  if (!query) return
  input.value = query
  autoScrollArmed.value = true
  await scrollToBottom()
  await onSend()
})

watch(
  latestMessageSignature,
  async () => {
    const container = messagesRef.value
    const latest = messages.value.at(-1)

    if (!container || !latest) {
      return
    }

    const latestIsStreamRole = latest.role === 'assistant'
    const shouldAutoScroll = autoScrollArmed.value || (latestIsStreamRole && isNearBottom(container))

    if (!shouldAutoScroll) {
      return
    }

    await scrollToBottom()
  },
  { flush: 'post' }
)
</script>

<template>
  <section class="flex flex-col flex-1 h-full min-h-0 bg-transparent">
    <div class="shrink-0 pb-4 border-b border-slate-200 dark:border-slate-700">
      <h1 class="m-0 text-xl font-semibold text-slate-900 dark:text-slate-100">Scrum Assistant</h1>
      <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Conversational control center for Rocks, Sprints, and Tasks</p>
    </div>

    <div class="flex-1 min-h-0 flex flex-col">
      <div ref="messagesRef" class="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4 pr-2 py-4" @scroll="onMessagesScroll">
        <ChatMessage
          v-for="(message, index) in messages"
          :key="message.id"
          :message="message"
          :disable-id-links="index === 0"
          @action="onAction"
          @query-id="onQueryId"
        />
        <div v-if="pending" class="thinking-bubble">
          <span class="dot" />
          <span class="dot" />
          <span class="dot" />
        </div>
      </div>
    </div>

    <div class="shrink-0 pt-4 border-t border-slate-200 dark:border-slate-700">
      <ChatInput
        ref="chatInputRef"
        v-model="input"
        @send="onSend"
        @uploaded="onUploaded"
        @upload-error="onUploadError"
      />
    </div>
  </section>
</template>

<style scoped>
.thinking-bubble {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 10px 14px;
  background: #F1F5F9;
  border: 1px solid #E2E8F0;
  border-radius: 16px;
  border-bottom-left-radius: 4px;
  width: fit-content;
  box-shadow: 0 1px 3px rgb(15 23 42 / 0.06);
}

.dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #3B82F6;
  animation: bounce 1.2s infinite ease-in-out;
}

.dot:nth-child(1) { animation-delay: 0s; }
.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40%            { transform: translateY(-5px); opacity: 1; }
}
</style>
