import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { useGeminiApiKey } from '~~/server/composables/useGeminiApiKey'
import { findPendingPlanBySessionId } from './state-store'
import { logger } from '~~/server/utils/logger'
import { costaRicaDate, movementDraft, usesUnsupportedMovementCurrency } from '../repositories/finance-model'

export type RouteName = 'planner' | 'strategy' | 'data' | 'knowledge' | 'retro' | 'END'

export interface AgentIntent {
  route: RouteName
  operation?:
  | 'create_rock'
  | 'create_sprint'
  | 'delete_rock'
  | 'list_backlog'
  | 'approve_tasks'
  | 'cancel_plan'
  | 'cancel_tasks'
  | 'approve_plan'
  | 'confirm_delete'
  | 'rag_query'
  | 'plan_tasks'
  | 'generate_plan'
  | 'update_sprint_status'
  | 'update_task_status'
  | 'generate_retrospective'
  | 'query_rock'
  | 'query_sprint'
  | 'query_task'
  | 'modify_plan'
  | 'create_cuota'
  | 'list_cuotas'
  | 'mark_cuota_pagada'
  | 'delete_cuota'
   | 'monthly_report'
   | 'category_report'
   | 'recent_movements'
   | 'propose_movement'
   | 'approve_movement'
   | 'cancel_movement'
  confidence?: number
  needsClarification?: boolean
  clarificationQuestion?: string
  explicitBacklogRequest?: boolean
  rockId?: string
  sprintId?: string
  taskId?: string
  status?: string
  actionId?: string
  payload?: Record<string, unknown>
}

type IntentOperation = NonNullable<AgentIntent['operation']>

interface IntentClassifierOutput {
  route: RouteName
  operation?: IntentOperation
  confidence: number
  needsClarification: boolean
  clarificationQuestion?: string
  explicitBacklogRequest: boolean
  rockId?: string
  sprintId?: string
  taskId?: string
  status?: string
  limit?: number
  movement?: Record<string, unknown>
}

const LIST_BACKLOG_CONFIDENCE_THRESHOLD = 0.8
const CLASSIFIER_TIMEOUT_MS = 6000

/**
 * Provides a deterministic bypass for approval actions that must never depend on the classifier.
 * @param input - Input containing action type and metadata
 * @returns An AgentIntent if the action matches a deterministic pattern, otherwise null
 */
function resolveDeterministicActionIntent(input: {
  action?: { type: string; actionId?: string; payload?: Record<string, unknown> }
}): AgentIntent | null {
  if (input.action?.type === 'cancel_plan' || input.action?.type === 'cancel_tasks') return { route: 'data', operation: input.action.type, actionId: input.action.actionId, confidence: 1 }
  if (input.action?.type === 'approve_movement' || input.action?.type === 'cancel_movement') return { route: 'data', operation: input.action.type, actionId: input.action.actionId, payload: input.action.payload, confidence: 1 }
  if (input.action?.type === 'approve_tasks') {
    return {
      route: 'data',
      operation: 'approve_tasks',
      actionId: input.action.actionId,
      payload: input.action.payload,
      confidence: 1,
      explicitBacklogRequest: false,
      needsClarification: false
    }
  }

  if (input.action?.type === 'approve_plan') {
    return {
      route: 'data',
      operation: 'approve_plan',
      actionId: input.action.actionId,
      payload: input.action.payload,
      confidence: 1,
      explicitBacklogRequest: false,
      needsClarification: false
    }
  }

  if (input.action?.type === 'confirm_delete') {
    return {
      route: 'data',
      operation: 'confirm_delete',
      actionId: input.action.actionId,
      payload: input.action.payload,
      confidence: 1,
      explicitBacklogRequest: false,
      needsClarification: false
    }
  }

  if (input.action?.type === 'update_sprint_status') {
    return {
      route: 'data',
      operation: 'update_sprint_status',
      sprintId: String(input.action.payload?.sprintId ?? ''),
      payload: input.action.payload,
      confidence: 1,
      explicitBacklogRequest: false,
      needsClarification: false
    }
  }

  if (input.action?.type === 'update_task_status') {
    return {
      route: 'data',
      operation: 'update_task_status',
      actionId: input.action.actionId,
      taskId: String(input.action.payload?.taskId ?? ''),
      payload: input.action.payload,
      confidence: 1,
      explicitBacklogRequest: false,
      needsClarification: false
    }
  }

  if (input.action?.type === 'generate_retrospective') {
    return {
      route: 'retro',
      operation: 'generate_retrospective',
      sprintId: String(input.action.payload?.sprintId ?? ''),
      payload: input.action.payload,
      confidence: 1,
      explicitBacklogRequest: false,
      needsClarification: false
    }
  }

  return null
}

/**
 * Extracts the first JSON object from model output, allowing robust parsing from mixed responses.
 * @param content - The model output text
 * @returns The extracted JSON string, or null if not found
 */
function extractJson(content: string): string | null {
  const direct = content.trim()
  if (direct.startsWith('{') && direct.endsWith('}')) {
    return direct
  }

  return content.match(/\{[\s\S]*\}/)?.[0] ?? null
}

/**
 * Validates route enum values to prevent invalid classifier output from leaking downstream.
 * @param value - The value to validate
 * @returns True if the value is a valid RouteName
 */
function isRouteName(value: unknown): value is RouteName {
  return value === 'planner' || value === 'strategy' || value === 'data' || value === 'knowledge' || value === 'retro' || value === 'END'
}

/**
 * Validates operation enum values to preserve existing downstream contracts.
 * @param value - The value to validate
 * @returns True if the value is a valid IntentOperation
 */
function isIntentOperation(value: unknown): value is IntentOperation {
  return value === 'create_rock'
    || value === 'create_sprint'
    || value === 'delete_rock'
    || value === 'list_backlog'
    || value === 'approve_tasks'
    || value === 'approve_plan'
    || value === 'confirm_delete'
    || value === 'rag_query'
    || value === 'plan_tasks'
    || value === 'generate_plan'
    || value === 'update_sprint_status'
    || value === 'update_task_status'
    || value === 'generate_retrospective'
    || value === 'query_rock'
    || value === 'query_sprint'
    || value === 'query_task'
    || value === 'modify_plan'
    || value === 'create_cuota'
    || value === 'list_cuotas'
    || value === 'mark_cuota_pagada'
    || value === 'delete_cuota'
    || value === 'monthly_report'
    || value === 'category_report'
    || value === 'recent_movements'
    || value === 'propose_movement'
}

/**
 * Normalizes confidence into the [0, 1] range with safe defaults for malformed outputs.
 * @param value - The confidence value to normalize
 * @returns A number between 0 and 1
 */
function normalizeConfidence(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return 0
  }

  if (parsed < 0) {
    return 0
  }

  if (parsed > 1) {
    return 1
  }

  return parsed
}

/**
 * Ensures model-provided IDs match repository conventions before they are propagated.
 * @param value - The ID value to normalize
 * @param prefix - The expected prefix ('R', 'S', or 'T')
 * @returns The normalized entity ID, or undefined if invalid
 */
function normalizeEntityId(value: unknown, prefix: 'R' | 'S' | 'T'): string | undefined {
  const raw = String(value ?? '').trim().toUpperCase()
  const pattern = prefix === 'R' ? /^R-[A-Z0-9]{4}$/ : prefix === 'S' ? /^S-[A-Z0-9]{4}$/ : /^(T-[A-Z0-9]{4}|U-[A-Z0-9]{4}|[A-F0-9]{64})$/
  if (!pattern.test(raw)) {
    return undefined
  }

  return prefix === 'T' && /^[A-F0-9]{64}$/.test(raw) ? raw.toLowerCase() : raw
}

/**
 * Provides a default operation for routes when the classifier omits it.
 * @param route - The route name
 * @returns The default operation for the route, or undefined
 */
function defaultOperationForRoute(route: RouteName): IntentOperation | undefined {
  if (route === 'strategy') {
    return 'generate_plan'
  }

  if (route === 'planner') {
    return 'plan_tasks'
  }

  if (route === 'knowledge') {
    return 'rag_query'
  }

  return undefined
}

/**
 * Produces a user-facing clarification prompt when the intent is uncertain.
 * @param _message - The user input message (unused)
 * @returns A clarification question for the user
 */
function buildClarificationQuestion(_message: string): string {
  return 'Fede, no pude interpretar tu solicitud con seguridad. ¿Quieres consultar movimientos, ver un resumen mensual o preparar un presupuesto?'
}

/**
 * Provides a safe fallback that never defaults to backlog listing when classification fails.
 * Only used when Gemini times out or errors — Gemini handles nuanced classification in the happy path.
 * @param message - The user input message
 * @returns A safe fallback AgentIntent
 */
export function buildSafeFallbackIntent(message: string, temporarilyUnavailable = false): AgentIntent {
  return {
    route: 'END',
    confidence: 0,
    explicitBacklogRequest: false,
    needsClarification: true,
    clarificationQuestion: temporarilyUnavailable ? 'Fede, el servicio de IA tardó demasiado o está temporalmente no disponible. No realicé cambios financieros en esta solicitud. Puedes volver a enviarla.' : buildClarificationQuestion(message)
  }
}

/**
 * Builds the routing-classifier prompt with strict JSON and explicit backlog safeguards.
 * @param message - The user input message
 * @param hasPendingPlan - Whether the user currently has a proposed plan open in preview
 * @returns The classifier prompt to send to the LLM
 */
function buildClassifierPrompt(message: string, hasPendingPlan: boolean): string {
  return `
The user is named Fede. Always address them as Fede.

You are an intent router for a personal finance assistant.
Decide the best flow for the user message.
Today's date in Costa Rica: ${costaRicaDate()}.

Return strict JSON only, with no markdown and no extra text.

JSON schema:
{
  "route": "planner|strategy|data|knowledge|retro|END",
  "operation": "create_rock|create_sprint|delete_rock|list_backlog|approve_tasks|approve_plan|confirm_delete|rag_query|plan_tasks|generate_plan|update_sprint_status|update_task_status|generate_retrospective|query_rock|query_sprint|query_task|modify_plan|create_cuota|list_cuotas|mark_cuota_pagada|delete_cuota|monthly_report|category_report|recent_movements|propose_movement|null",
  "confidence": 0.0,
  "needsClarification": true,
  "clarificationQuestion": "string",
  "explicitBacklogRequest": false,
  "rockId": "R-XXXX",
  "sprintId": "S-XXXX",
  "taskId": "T-XXXX",
  "status": "planned|in_progress|completed|on_hold|pending|null",
  "limit": 5,
  "movement": null
}

${hasPendingPlan ? `
IMPORTANT CONTEXT: The user currently has a proposed plan open in preview (waiting for approval).
If the message is about modifying that plan (adding sprints, removing tasks, changing structure),
use route "data" with operation "modify_plan".
` : ''}

Rules:
- Do not choose list_backlog unless the user explicitly asks to list/show/see current backlog items.
- For an explicit request to register ONE real expense, income or withdrawal, use route data and propose_movement, never a full budget. Extract movement as {"fecha":"YYYY-MM-DD","tipo":"gasto|ingreso|retiro","descripcion":"string","categoria":"string","monto":"major-unit decimal string","currency":"CRC"}. Use the Costa Rica date above for "hoy" or when the user omits the date; resolve explicit past dates accurately. Do not invent amounts, descriptions or categories: ask a Spanish clarification when required details are unclear. Only CRC is supported; ask for clarification for USD, dollars, euros, ambiguous currencies or future movements. Do not include user/account/period IDs or approval flags. This only prepares a draft; the user must confirm using the UI before any movement is written. For all other operations, movement must be null.
- Use route strategy with generate_plan for any free-form budgeting or planning request (monthly budget, savings goal, financial plan) that does NOT contain explicit Account IDs (R-XXXX) or Period IDs (S-XXXX).
- Use route planner with plan_tasks ONLY when the user asks to break work into tasks AND provides explicit R-XXXX and S-XXXX identifiers.
- If the message looks like a budgeting goal but has no IDs, always prefer strategy over planner.
- Short acknowledgements or ambiguous messages should use route END with needsClarification=true and a helpful clarificationQuestion.
- Use route knowledge with rag_query for questions about uploaded financial documents (bank statements, invoices, budgets), or "why/analysis" questions.
- Use route data with update_sprint_status when the user wants to change the status of a period and provides a Sprint ID (S-XXXX). Valid statuses: planned, in_progress, completed, on_hold.
- Use route data with update_task_status when the user wants to change the status of a movement and provides a Task ID (T-XXXX). Valid statuses: pending, in_progress, completed.
- Use route data with operation "query_rock" when the user asks about the status, details, or progress of a specific account/category (must include R-XXXX).
- Use route data with operation "query_sprint" when the user asks about the details or movements of a specific period (must include S-XXXX).
- Use route data with operation "query_task" when the user asks about the details of a specific movement (must include T-XXXX).
- Use route data with operation "create_cuota" when the user wants to register a fixed subscription/cuota. Message format: create cuota | Name | mensual/anual | Amount | Category.
- Use route data with operation "list_cuotas" when the user asks to show/list fixed subscriptions (cuotas), their amounts, current paid/pending/paused states, or due dates. This is a read-only status query, NOT mark_cuota_pagada, a budget request, monthly_report, or document search. The data agent explains missing history/due dates; never invent a due date or ask for technical IDs just to list cuotas.
- Use route data with operation "mark_cuota_pagada" when the user wants to mark a cuota as paid. Must include a cuota ID (U-XXXX).
- Use route data with operation "delete_cuota" when the user wants to delete a cuota. Must include a cuota ID (U-XXXX).
- Use route data with operation "monthly_report" for monthly income, expenses, withdrawals, balance or summary questions. Accept an explicit YYYY-MM or relative expressions such as "este mes", "mes pasado", "this month" and "last month"; the data agent resolves the period. Do not ask for a technical ID or route these questions to document search.
- Use route data with operation "category_report" for expense category breakdowns, rankings, or questions about the category with the highest spending. Do not route these to document search or monthly_report. The data agent defaults to the current month if no period is specified.
- Use route data with operation "recent_movements" to list recent movements, without requiring account/period IDs. Set limit to the requested integer (understand number words such as "cinco"); default 5. Maximum 20 per query; if the user requests more, ask them to select 1–20. If no period is specified, show recent movements across all recorded history. This route lists all movement types, not a merchant/type-specific filtered list; ask for clarification for unsupported filters, without demanding technical IDs.
- Use route retro with generate_retrospective when user asks for a monthly analysis/review or period retrospective. Must include a Sprint ID (S-XXXX) in the message.
- Use route "data" with operation "modify_plan" ONLY when IMPORTANT CONTEXT says a plan is pending AND the user wants to add/remove/change sprints or tasks in that plan.
- When operation is "update_sprint_status", extract the intended status from the message if mentioned. Valid values: planned, in_progress, completed, on_hold. Set "status" to null if not mentioned.
- When operation is "update_task_status", extract the intended status from the message if mentioned. Valid values: pending, in_progress, completed. Set "status" to null if not mentioned.
- Set confidence between 0 and 1.

User message:
${message}
`
}

/**
 * Calls Gemini classifier with timeout protection so intent routing remains responsive.
 * @param message - The user input message
 * @param hasPendingPlan - Whether the user currently has a proposed plan open in preview
 * @returns The classified intent output from the LLM
 * @throws Error if classification times out or returns invalid JSON
 */
async function classifyIntentWithGemini(message: string, hasPendingPlan: boolean): Promise<IntentClassifierOutput> {
  const apiKey = useGeminiApiKey()
  const model = new ChatGoogleGenerativeAI({
    apiKey,
    model: 'gemini-3.1-flash-lite',
    temperature: 0,
    maxRetries: 0,
    maxOutputTokens: 1000
  })

  const response = await model.invoke(buildClassifierPrompt(message, hasPendingPlan), { signal: AbortSignal.timeout(CLASSIFIER_TIMEOUT_MS) })
  const content = String(response.content)
  const jsonText = extractJson(content)

  if (!jsonText) {
    throw new Error('Classifier did not return JSON.')
  }

  const parsed = JSON.parse(jsonText) as {
    route?: unknown
    operation?: unknown
    confidence?: unknown
    needsClarification?: unknown
    clarificationQuestion?: unknown
    explicitBacklogRequest?: unknown
    rockId?: unknown
    sprintId?: unknown
    taskId?: unknown
    status?: unknown
    limit?: unknown
    movement?: unknown
  }

  if (!isRouteName(parsed.route)) {
    throw new Error('Classifier returned an invalid route value.')
  }

  const operation = parsed.operation == null
    ? defaultOperationForRoute(parsed.route)
    : (isIntentOperation(parsed.operation) ? parsed.operation : undefined)

  if (parsed.limit != null && (typeof parsed.limit !== 'number' || !Number.isInteger(parsed.limit))) throw new Error('Classifier returned an invalid movement limit.')
  if (operation === 'propose_movement' && parsed.route !== 'data') throw new Error('Movement drafts require the data route.')
  const movement = operation === 'propose_movement' && !parsed.needsClarification ? movementDraft.parse(parsed.movement) : undefined

  return {
    route: parsed.route,
    operation,
    confidence: normalizeConfidence(parsed.confidence),
    needsClarification: Boolean(parsed.needsClarification),
    clarificationQuestion: String(parsed.clarificationQuestion ?? '').trim() || undefined,
    explicitBacklogRequest: Boolean(parsed.explicitBacklogRequest),
    rockId: normalizeEntityId(parsed.rockId, 'R'),
    sprintId: normalizeEntityId(parsed.sprintId, 'S'),
    taskId: normalizeEntityId(parsed.taskId as unknown, 'T'),
    status: typeof parsed.status === 'string' && parsed.status !== 'null' ? parsed.status : undefined,
    limit: typeof parsed.limit === 'number' ? parsed.limit : undefined,
    movement
  }
}

/**
 * Detects the user's intent by routing through deterministic actions or LLM classification.
 * @param input - Input containing user message, optional action metadata, and sessionId for pending plan detection
 * @returns The detected AgentIntent for routing to appropriate handler
 */
export async function detectIntent(input: {
  uid: string
  message: string
  sessionId: string
  action?: { type: string; actionId?: string; payload?: Record<string, unknown> }
}): Promise<AgentIntent> {
  const message = input.message.trim()
  const deterministicIntent = resolveDeterministicActionIntent(input)
  if (deterministicIntent) {
    const resolved = deterministicIntent
    logger.debug('Supervisor', `Deterministic bypass → op="${resolved.operation}"`)
    return deterministicIntent
  }

  if (/\b(registra|registrar|anota|anotar|agrega|agregar|guarda|guardar)\b/i.test(message) && /\b(gastos?|ingresos?|retiros?|movimientos?)\b/i.test(message) && usesUnsupportedMovementCurrency(message)) {
    return { route: 'END', needsClarification: true, confidence: 1, clarificationQuestion: 'Fede, el registro por chat admite solo colones CRC. Confirma la moneda y el importe antes de preparar el movimiento.' }
  }

  const pendingPlanEntry = await findPendingPlanBySessionId(input.uid, input.sessionId)
  const hasPendingPlan = !!pendingPlanEntry

  try {
    logger.debug('Supervisor', 'Calling Gemini classifier...')
    const classified = await classifyIntentWithGemini(message, hasPendingPlan)
    const parsed = classified
    logger.debug('Supervisor', `Gemini classified → route="${parsed.route}" op="${parsed.operation}" confidence=${parsed.confidence} hasPendingPlan=${hasPendingPlan}`)

    if (
      classified.route === 'data'
      && classified.operation === 'list_backlog'
      && (!classified.explicitBacklogRequest || classified.confidence < LIST_BACKLOG_CONFIDENCE_THRESHOLD)
    ) {
      return buildSafeFallbackIntent(message)
    }

    // Attach actionId for modify_plan so data-agent can locate the pending plan.
    if (classified.operation === 'modify_plan' && pendingPlanEntry) {
      logger.debug('Supervisor', `modify_plan via Gemini for session=${input.sessionId}`)
      return {
        route: 'data',
        operation: 'modify_plan',
        actionId: pendingPlanEntry.actionId,
        confidence: classified.confidence,
        needsClarification: false,
        explicitBacklogRequest: false
      }
    }

    if (classified.needsClarification || classified.route === 'END') {
      return {
        route: 'END',
        confidence: classified.confidence,
        explicitBacklogRequest: classified.explicitBacklogRequest,
        needsClarification: true,
        clarificationQuestion: classified.clarificationQuestion || buildClarificationQuestion(message),
        rockId: classified.rockId,
        sprintId: classified.sprintId
      }
    }

    return {
      route: classified.route,
      operation: classified.operation,
      confidence: classified.confidence,
      explicitBacklogRequest: classified.explicitBacklogRequest,
      needsClarification: false,
      rockId: classified.rockId,
      sprintId: classified.sprintId,
      taskId: classified.taskId,
      status: classified.status,
      payload: classified.operation === 'recent_movements' ? { limit: classified.limit ?? 5 } : classified.operation === 'propose_movement' ? classified.movement : undefined
    }
  } catch (error) {
    const kind = error instanceof Error && ['AbortError', 'TimeoutError', 'ZodError', 'SyntaxError', 'Error', 'GoogleGenerativeAIFetchError'].includes(error.name) ? error.name : 'UnknownError'
    const status = error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' && error.status >= 100 && error.status <= 599 ? error.status : undefined
    logger.warn('Supervisor', 'Intent classification failed; requesting clarification.', { kind, status })
    return buildSafeFallbackIntent(message, ['AbortError', 'TimeoutError'].includes(kind) || status === 429 || (status ?? 0) >= 500)
  }
}
