import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { useGeminiApiKey } from '~~/server/composables/useGeminiApiKey'
import { findPendingPlanBySessionId } from './state-store'
import { logger } from '~~/server/utils/logger'

export type RouteName = 'planner' | 'strategy' | 'data' | 'knowledge' | 'retro' | 'END'

export interface AgentIntent {
  route: RouteName
  operation?:
  | 'create_rock'
  | 'create_sprint'
  | 'delete_rock'
  | 'list_backlog'
  | 'approve_tasks'
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
  const pattern = prefix === 'R' ? /^R-[A-Z0-9]{4}$/ : prefix === 'S' ? /^S-[A-Z0-9]{4}$/ : /^T-[A-Z0-9]{4}$/
  if (!pattern.test(raw)) {
    return undefined
  }

  return raw
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
  return 'Could you share what you want to do next? I can generate a plan, break work into tasks, query documents, or update items.'
}

/**
 * Provides a safe fallback that never defaults to backlog listing when classification fails.
 * Only used when Gemini times out or errors — Gemini handles nuanced classification in the happy path.
 * @param message - The user input message
 * @returns A safe fallback AgentIntent
 */
function buildSafeFallbackIntent(message: string): AgentIntent {
  if (message.trim().length >= 25) {
    return {
      route: 'strategy',
      operation: 'generate_plan',
      confidence: 0,
      explicitBacklogRequest: false,
      needsClarification: false
    }
  }

  return {
    route: 'END',
    confidence: 0,
    explicitBacklogRequest: false,
    needsClarification: true,
    clarificationQuestion: buildClarificationQuestion(message)
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
You are an intent router for a product planning assistant.
Decide the best flow for the user message.

Return strict JSON only, with no markdown and no extra text.

JSON schema:
{
  "route": "planner|strategy|data|knowledge|retro|END",
  "operation": "create_rock|create_sprint|delete_rock|list_backlog|approve_tasks|approve_plan|confirm_delete|rag_query|plan_tasks|generate_plan|update_sprint_status|update_task_status|generate_retrospective|query_rock|query_sprint|query_task|modify_plan|null",
  "confidence": 0.0,
  "needsClarification": true,
  "clarificationQuestion": "string",
  "explicitBacklogRequest": false,
  "rockId": "R-XXXX",
  "sprintId": "S-XXXX",
  "taskId": "T-XXXX",
  "status": "planned|in_progress|completed|on_hold|pending|null"
}

${hasPendingPlan ? `
IMPORTANT CONTEXT: The user currently has a proposed plan open in preview (waiting for approval).
If the message is about modifying that plan (adding sprints, removing tasks, changing structure),
use route "data" with operation "modify_plan".
` : ''}

Rules:
- Do not choose list_backlog unless the user explicitly asks to list/show/see current backlog items.
- Use route strategy with generate_plan for any free-form planning request (goals, objectives, initiatives) that does NOT contain explicit Rock IDs (R-XXXX) or Sprint IDs (S-XXXX).
- Use route planner with plan_tasks ONLY when the user asks to break work into tasks AND provides explicit R-XXXX and S-XXXX identifiers.
- If the message looks like a planning goal but has no IDs, always prefer strategy over planner.
- Short acknowledgements or ambiguous messages should use route END with needsClarification=true and a helpful clarificationQuestion.
- Use route knowledge with rag_query for questions about documents, transcripts, or "why/blocked" analysis.
- Use route data with update_sprint_status when the user wants to change the status of a sprint and provides a Sprint ID (S-XXXX). Valid statuses: planned, in_progress, completed, on_hold.
- Use route data with update_task_status when the user wants to change the status of a task and provides a Task ID (T-XXXX). Valid statuses: pending, in_progress, completed.
- Use route data with operation "query_rock" when the user asks about the status, details, progress, or description of a specific Rock (must include R-XXXX).
- Use route data with operation "query_sprint" when the user asks about the status, details, tasks, or progress of a specific Sprint (must include S-XXXX).
- Use route data with operation "query_task" when the user asks about the status, details, owner, or deadline of a specific Task (must include T-XXXX).
- Use route retro with generate_retrospective when user asks for sprint retrospective, sprint review, retro summary, or sprint recap. Must include a Sprint ID (S-XXXX) in the message.
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
    model: 'gemini-2.5-flash',
    temperature: 0
  })

  const invocation = model.invoke(buildClassifierPrompt(message, hasPendingPlan))
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Intent classification timed out.')), CLASSIFIER_TIMEOUT_MS)
  })

  const response = await Promise.race([invocation, timeout])
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
  }

  if (!isRouteName(parsed.route)) {
    throw new Error('Classifier returned an invalid route value.')
  }

  const operation = parsed.operation == null
    ? defaultOperationForRoute(parsed.route)
    : (isIntentOperation(parsed.operation) ? parsed.operation : undefined)

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
    status: typeof parsed.status === 'string' && parsed.status !== 'null' ? parsed.status : undefined
  }
}

/**
 * Detects the user's intent by routing through deterministic actions or LLM classification.
 * @param input - Input containing user message, optional action metadata, and sessionId for pending plan detection
 * @returns The detected AgentIntent for routing to appropriate handler
 */
export async function detectIntent(input: {
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

  const pendingPlanEntry = findPendingPlanBySessionId(input.sessionId)
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
      status: classified.status
    }
  } catch {
    return buildSafeFallbackIntent(message)
  }
}
