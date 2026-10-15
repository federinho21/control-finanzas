import { createError, eventHandler, sendStream, setHeader, type H3Event } from 'h3'
import { z } from 'zod'
import { runGraph, type RunGraphInput } from '../agents/graph'
import { getAgentRepository, actionSession } from '../repositories/agent'
import { requireAuthOrigin, requireUser } from '../utils/auth'
import { readLimitedJson } from '../utils/request-input'
import { FinanceError } from '../repositories/finance-model'

const inputSchema = z.object({ sessionId: actionSession, message: z.string().trim().min(1).max(8000), action: z.object({ type: z.enum(['approve_tasks', 'approve_plan', 'cancel_plan', 'cancel_tasks', 'confirm_delete', 'update_task_status', 'update_sprint_status', 'generate_retrospective', 'approve_movement', 'cancel_movement']), actionId: z.string().uuid().optional(), payload: z.record(z.string(), z.unknown()).optional() }).strict().optional() }).strict().refine(input => !input.action || ['update_sprint_status', 'generate_retrospective'].includes(input.action.type) || !!input.action.actionId, 'Approval ID required.').refine(input => !input.action || !['approve_movement', 'cancel_movement'].includes(input.action.type) || !Object.keys(input.action.payload ?? {}).length, 'Movement approvals cannot contain overrides.')

export function createChatHandler(dependencies: {
  user: typeof requireUser; origin: typeof requireAuthOrigin
  quota: (uid: string) => Promise<void>; graph: (input: RunGraphInput) => Promise<{ judgeWarning: string | null; guardrailError: string | null }>
}) {
  return eventHandler(async (event: H3Event) => {
    const user = await dependencies.user(event)
    dependencies.origin(event)
    const parsed = inputSchema.safeParse(await readLimitedJson(event))
    if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid chat request.' })
    try { await dependencies.quota(user.uid) } catch (error) {
      throw createError({ statusCode: error instanceof FinanceError ? error.statusCode : 503, statusMessage: 'Chat quota unavailable or exceeded.' })
    }
    setHeader(event, 'Content-Type', 'text/event-stream; charset=utf-8')
    setHeader(event, 'Cache-Control', 'no-store, no-transform')
    setHeader(event, 'Vary', 'Cookie')
    let closed = false
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const write = (value: Record<string, unknown>) => { if (!closed) controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`)) }
        void (async () => {
          try {
            const final = await dependencies.graph({ uid: user.uid, ...parsed.data, onEvent: ({ type, data }) => write({ type, ...data }) })
            if (final.judgeWarning) write({ type: 'judge', message: final.judgeWarning })
            if (final.guardrailError) write({ type: 'guardrail', message: final.guardrailError })
          } catch {
            write({ type: 'error', message: 'Could not process this request. Please retry.' })
          } finally {
            if (!closed) { write({ type: 'done' }); closed = true; controller.close() }
          }
        })()
      },
      cancel() { closed = true }
    })
    return sendStream(event, body)
  })
}
export default createChatHandler({ user: requireUser, origin: requireAuthOrigin, quota: uid => getAgentRepository().quota(uid, 'chat', 20, 60000), graph: runGraph })
