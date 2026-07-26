import { eventHandler, readBody, setHeader } from 'h3'
import { runGraph } from '~~/server/agents/graph'
import { logger } from '~~/server/utils/logger'

/**
 * Writes a single Server-Sent Events payload to the response stream.
 * @param res Node response object used to write SSE frames.
 * @param payload Event payload serialized as JSON for the client.
 * @returns {void} No value is returned.
 */
function writeSse(res: any, payload: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

/**
 * Handles POST /api/chat and streams agent events to the client via SSE.
 * @param event Nitro event containing the request body with session, message, and optional action.
 * @returns Streamed SSE response ending with done, or an error event payload.
 * @throws Sends an SSE error event when graph execution or request processing fails.
 */
export default eventHandler(async (event) => {
  const body = await readBody<{
    sessionId?: string
    message: string
    action?: { type: string; actionId?: string; payload?: Record<string, unknown> }
  }>(event)

  const sessionId = body.sessionId || 'default-session'

  setHeader(event, 'Content-Type', 'text/event-stream; charset=utf-8')
  setHeader(event, 'Cache-Control', 'no-cache, no-transform')
  setHeader(event, 'Connection', 'keep-alive')

  const res = event.node.res

  try {
    logger.info('SSE', `request session=${sessionId} action=${body.action?.type ?? 'none'} message="${body.message.slice(0, 60)}"`)

    const finalState = await runGraph({
      sessionId,
      message: body.message,
      action: body.action,
      onEvent: ({ type, data }) => {
        if (type === 'status') {
          logger.debug('SSE', `status → ${String(data.message || 'Processing...')}`)
        }

        if (type === 'result') {
          writeSse(res, {
            type: 'result',
            message: data.message,
            proposedTasks: data.proposedTasks ?? null,
            proposedPlan: data.proposedPlan ?? null,
            actionRequest: data.actionRequest ?? null,
            refreshBacklog: Boolean(data.refreshBacklog)
          })
          logger.info('SSE', `emit result refreshBacklog=${Boolean(data.refreshBacklog)} hasActionRequest=${!!data.actionRequest} hasProposedPlan=${!!data.proposedPlan} hasProposedTasks=${!!(data.proposedTasks as unknown[])?.length}`)
        }
      }
    })

    // Emit judge warning if LLM-as-a-Judge detected inconsistency.
    if (finalState.judgeWarning) {
      writeSse(res, { type: 'judge', message: finalState.judgeWarning })
      logger.warn('SSE', `emit judge warning session=${sessionId}`)
    }

    // Emit guardrail error as a distinct event type.
    if (finalState.guardrailError) {
      writeSse(res, { type: 'guardrail', message: finalState.guardrailError })
      logger.warn('SSE', `emit guardrail error session=${sessionId}`)
    }

    writeSse(res, { type: 'done' })
    logger.info('SSE', `done session=${sessionId}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected agent error.'
    writeSse(res, {
      type: 'error',
      message: `There was a problem processing your request: ${message}`
    })
    logger.error('SSE', `error session=${sessionId}`, error instanceof Error ? error.message : error)
  } finally {
    res.end()
  }
})
