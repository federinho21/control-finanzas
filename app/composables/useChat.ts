import { nanoid } from 'nanoid'
import type { ChatMessage, UiAction } from '~~/shared/types/chat'
import type { ProposedPlan } from '~~/shared/types/plan'
import type { ProposedTask } from '~~/shared/types/task'
import { normalizeDateToDb } from '~~/shared/utils/date'
import { usePlanPreview } from '~/composables/usePlanPreview'
import { SessionChangedError } from '~/utils/web-session'

// Parses buffered SSE chunks into JSON events and keeps incomplete data for the next read.
function parseSseChunk(buffer: string): { events: Array<Record<string, any>>; rest: string } {
  const parts = buffer.split('\n\n')
  const complete = parts.slice(0, -1)
  const rest = parts[parts.length - 1] || ''

  const events = complete
    .map((block) => {
      const line = block.split('\n').find((value) => value.startsWith('data:'))
      if (!line) {
        return null
      }

      const json = line.slice(5).trim()
      try {
        return JSON.parse(json)
      } catch {
        return null
      }
    })
    .filter(Boolean) as Array<Record<string, any>>

  return { events, rest }
}

// Builds the personalized welcome message with the current date/time in Costa Rica (UTC-6).
function buildWelcomeMessage(): ChatMessage {
  const crFormatter = new Intl.DateTimeFormat('es-CR', {
    timeZone: 'America/Costa_Rica',
    dateStyle: 'full',
    timeStyle: 'short'
  })
  const nowCr = crFormatter.format(new Date())

  return {
    id: nanoid(),
    role: 'assistant',
    isWelcome: true,
    content:
      `👋 ¡Hola, **Fede**! Soy tu **Asistente Financiero**.\n🕐 Hoy es **${nowCr}** en Costa Rica.\n\n**¿En qué te puedo ayudar hoy?**\n\n📋 **Presupuesto**\n• Describe un objetivo mensual y genero un plan de presupuesto completo (cuenta → períodos → movimientos)\n• Genera movimientos para una cuenta y período existentes\n• Mientras revisas el plan, pídeme modificarlo (ej. "agrega un período" o "quita el último movimiento")\n\n✅ **Movimientos**\n• Registra un gasto/ingreso/retiro y lo clasifico por categoría\n• Consulta el resumen del mes: "muéstrame el balance de 2026-08"\n• Marca un movimiento como pagado\n\n🔁 **Cuotas fijas**\n• Registra suscripciones: \`create cuota | Netflix | mensual | 5000 | Streaming\`\n• Marca una cuota como pagada (se registra como gasto automáticamente)\n\n🔍 **Consultas & RAG**\n• "Cuéntame sobre R-0001" o "¿Qué hay en S-0003?"\n• Sube un .txt o .pdf (factura, extracto bancario) y pregúntale por su contenido\n\n📈 **Análisis mensual**\n• Pide un análisis del mes (ej. "generate retro for S-0001")\n\n⚡ **Ejemplos**\n• "Crea un presupuesto para agosto"\n• "Cuéntame sobre R-0001"\n• "Marca la cuota U-0001 como pagada"`,
    createdAt: new Date().toISOString()
  }
}

/**
 * Manages chat session state, message history, and interactions with the AI assistant.
 * 
 * @returns An object containing chat state arrays, pending status, and methods to send messages and submit actions.
 */
export function useChat() {
  const auth = useAuth()
  const sessionId = useState<string>('chat-session-id', () => crypto.randomUUID())
  const messages = useState<ChatMessage[]>('chat-messages', () => [buildWelcomeMessage()])
  if (!messages.value.length) messages.value = [buildWelcomeMessage()]
  const pending = useState<boolean>('chat-pending', () => false)
  const reconnecting = useState<boolean>('chat-reconnecting', () => false)

  const { refreshBacklog } = useBacklog()
  const { setPlan, tempId: previewTempId } = usePlanPreview()

  // Sends a chat request and processes streamed SSE events into UI state updates.
  async function streamRequest(payload: Record<string, unknown>) {
    const version = auth.version()
    const response = await auth.request(async signal => {
      const response = await fetch('/api/chat', {
        method: 'POST',
        credentials: 'include',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId.value, ...payload })
      })
      if (response.status === 401) throw Object.assign(new Error('Unauthorized.'), { statusCode: 401 })
      return response
    })

    if (!response.ok || !response.body) {
      throw new Error(`Chat request failed (${response.status})`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (version !== auth.version()) throw new SessionChangedError()
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })
      const parsed = parseSseChunk(buffer)
      buffer = parsed.rest

      for (const event of parsed.events) {
        if (version !== auth.version()) throw new SessionChangedError()
        if (event.type === 'result') {
          const chatMessage: ChatMessage = {
            id: nanoid(),
            role: 'assistant',
            content: String(event.message || ''),
            createdAt: new Date().toISOString()
          }

          const proposedTasks = event.proposedTasks as ProposedTask[] | null
          if (proposedTasks?.length) {
            chatMessage.proposedTasks = proposedTasks
          }

          const proposedPlan = event.proposedPlan as ProposedPlan | null
          if (proposedPlan) {
            chatMessage.proposedPlan = proposedPlan
          }

          const actionRequest = event.actionRequest as
            | {
                type: 'approve_tasks' | 'confirm_delete' | 'approve_plan' | 'update_sprint_status' | 'update_task_status'
                actionId: string
                prompt: string
                entityId?: string
                statusOptions?: Array<{ label: string; value: string; color: string }>
              }
            | undefined

          if (actionRequest) {
            const hasPlanApprovalPreview = actionRequest.type === 'approve_plan' && Boolean(proposedPlan)

            if (hasPlanApprovalPreview) {
              setPlan({ plan: proposedPlan as ProposedPlan, actionId: actionRequest.actionId })
              await navigateTo('/preview')
            } else {
              const actions =
                actionRequest.type === 'approve_tasks'
                ? [
                    {
                      type: 'approve_tasks' as const,
                      actionId: actionRequest.actionId,
                      label: 'Approve tasks',
                      color: 'success' as const
                    }
                  ]
                : actionRequest.type === 'confirm_delete'
                  ? [
                    {
                      type: 'confirm_delete' as const,
                      actionId: actionRequest.actionId,
                      label: 'Confirm deletion',
                      color: 'error' as const,
                      payload: { confirmed: true }
                    },
                    {
                      type: 'confirm_delete' as const,
                      actionId: actionRequest.actionId,
                      label: 'Cancel',
                      color: 'neutral' as const,
                      payload: { confirmed: false }
                    }
                  ]
                : actionRequest.type === 'update_sprint_status' && actionRequest.statusOptions
                  ? actionRequest.statusOptions.map(opt => ({
                      type: 'update_sprint_status' as const,
                      actionId: actionRequest.actionId,
                      label: opt.label,
                      color: opt.color as UiAction['color'],
                      payload: { sprintId: actionRequest.entityId, status: opt.value }
                    }))
                : actionRequest.type === 'update_task_status' && actionRequest.statusOptions
                  ? actionRequest.statusOptions.map(opt => ({
                      type: 'update_task_status' as const,
                      actionId: actionRequest.actionId,
                      label: opt.label,
                      color: opt.color as UiAction['color'],
                      payload: { taskId: actionRequest.entityId, status: opt.value }
                    }))
                  : []

              if (actions.length) {
                chatMessage.actions = actions
              }
            }
          }

          if (version !== auth.version()) throw new SessionChangedError()
          messages.value.push(chatMessage)

          if (event.refreshBacklog) {
            await refreshBacklog()
          }
        }

        if (event.type === 'error') {
          messages.value.push({
            id: nanoid(),
            role: 'error',
            content: String(event.message || 'Unexpected error'),
            createdAt: new Date().toISOString()
          })
        }
        
        // Handles judge evaluation messages from the backend
        if (event.type === 'judge') {
          messages.value.push({
            id: nanoid(),
            role: 'judge',
            content: String(event.message || ''),
            createdAt: new Date().toISOString()
          })
        }
        
        // Handles guardrail validation failures to inform the user
        if (event.type === 'guardrail') {
          messages.value.push({
            id: nanoid(),
            role: 'guardrail',
            content: String(event.message || ''),
            createdAt: new Date().toISOString()
          })
        }
      }
    }
  }

  // Sends a user message and streams assistant updates into the conversation timeline.
  async function sendMessage(message: string) {
    const version = auth.version()
    const trimmed = message.trim()
    if (!trimmed || pending.value) {
      return
    }

    pending.value = true

    messages.value.push({
      id: nanoid(),
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString()
    })

    try {
      reconnecting.value = false
      await streamRequest({ message: trimmed })
    } catch (error) {
      if (version !== auth.version()) return
      reconnecting.value = true
      messages.value.push({
        id: nanoid(),
        role: 'error',
        content: `There was a problem processing your request. ${error instanceof Error ? error.message : ''}`,
        createdAt: new Date().toISOString()
      })
    } finally {
      if (version === auth.version()) pending.value = false
    }
  }

  // Submits a pending UI action back to the assistant workflow.
  async function submitAction(action: {
    type: 'approve_tasks' | 'confirm_delete' | 'approve_plan' | 'cancel_plan' | 'cancel_tasks' | 'update_sprint_status' | 'update_task_status'
    actionId: string
    payload?: Record<string, unknown>
  }, editedTasks?: ProposedTask[], editedPlan?: ProposedPlan) {
    const version = auth.version()
    if (pending.value) {
      return false
    }

    pending.value = true
    try {
      const normalizedTasks = action.type === 'approve_tasks'
        ? (editedTasks ?? []).map((task) => ({
            ...task,
            deadline: normalizeDateToDb(task.deadline)
          }))
        : undefined

      const planPayload = action.type === 'approve_plan'
        ? { plan: editedPlan, tempId: previewTempId.value ?? undefined }
        : undefined

      await streamRequest({
        message: 'Approval action',
        action: {
          type: action.type,
          actionId: action.actionId,
          payload:
            action.type === 'approve_tasks'
              ? { tasks: normalizedTasks }
              : action.type === 'approve_plan'
                ? planPayload
                : action.payload
        }
      })
      return version === auth.version()
    } catch (error) {
      if (version !== auth.version()) return false
      messages.value.push({
        id: nanoid(),
        role: 'error',
        content: `Could not complete the action. ${error instanceof Error ? error.message : ''}`,
        createdAt: new Date().toISOString()
      })
      return false
    } finally {
      if (version === auth.version()) pending.value = false
    }
  }

  return {
    messages,
    pending,
    reconnecting,
    sendMessage,
    submitAction
  }
}
