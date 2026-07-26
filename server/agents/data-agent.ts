import type { ProposedTask } from '~~/shared/types/task'
import type { ProposedPlan } from '~~/shared/types/plan'
import { eq } from 'drizzle-orm'
import { normalizeDateToDb, userDateToDb } from '~~/shared/utils/date'
import { db } from '~~/server/db'
import { documents } from '~~/server/db/schema'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { useGeminiApiKey } from '~~/server/composables/useGeminiApiKey'
import { logger } from '~~/server/utils/logger'
import {
  batchCreateTasks,
  createRock,
  createSprint,
  deleteRock,
  listBacklog,
  queryRock,
  querySprint,
  queryTask,
  savePlan,
  updateSprintStatus,
  updateTaskStatus
} from './tools/sql-tools'
import {
  findPendingPlanBySessionId,
  getPendingDelete,
  getPendingPlan,
  getPendingTasks,
  savePendingDelete,
  savePendingPlan,
  takePendingDelete,
  takePendingPlan,
  takePendingTasks
} from './state-store'

/**
 * Asserts that a sprint's start date is not after its end date.
 * @param input - Object containing sprint start and end dates in DB format (YYYY-MM-DD)
 * @throws {Error} When startDate is after endDate
 */
function validateSprintDateOrder(input: { startDateDb: string; endDateDb: string }): void {
  if (input.startDateDb > input.endDateDb) {
    throw new Error('Sprint start date cannot be after end date. Please set a start date on or before the end date.')
  }
}



/**
 * Generates a formatted natural-language response using Gemini based on structured database data.
 * @param context - Structured data retrieved from the database, serialized as JSON.
 * @param userQuestion - The original question asked by the user.
 * @returns A formatted natural-language response string.
 */
async function summarizeWithLLM(context: string, userQuestion: string): Promise<string> {
  const apiKey = useGeminiApiKey()
  const model = new ChatGoogleGenerativeAI({
    apiKey,
    model: 'gemini-2.5-flash',
    temperature: 0.3
  })

  const response = await model.invoke(`You are a helpful Scrum Assistant. The user asked: "${userQuestion}"

Here is the structured data retrieved from the database (JSON):
${context}

Rules for your response:
- Respond in the SAME LANGUAGE as the user's question. If they asked in Spanish, answer in Spanish. If English, answer in English, etc.
- Be conversational and user-friendly, not robotic.
- Use markdown to structure your response: **bold** for labels and key values, bullet lists for multiple items, and ## headers for sections when there are 3 or more distinct sections.
- Keep responses concise. Avoid excessive headers for simple single-entity queries.
- Format all dates as MM/DD/YYYY.
- Status values must be title-cased words: "Pending", "In Progress", "Completed", "On Hold", "Active", "Blocked", "Planned". Never show raw snake_case like "in_progress".
- Priority values must be capitalized: "High", "Medium", "Low". Never uppercase like "HIGH".
- Include all relevant fields from the data.
- Do not invent or add information that is not in the provided data.`)

  return String(response.content)
}

type DataOperationInput = {
  // Session that owns the action request and can consume pending approvals.
  sessionId: string
  operation?: string
  message: string
  rockId?: string
  sprintId?: string
  taskId?: string
  status?: string
  actionId?: string
  payload?: Record<string, unknown>
}

// Handles 'create_rock' operations.
async function handleCreateRock(input: DataOperationInput) {
  const chunks = input.message.split('|').map((value) => value.trim())
  if (chunks.length < 4) {
    return {
      message: 'Format to create a rock: create rock | Name | Description | MM/DD/YYYY'
    }
  }

  const [, rawName, rawDescription, rawDeadline] = chunks
  const name = rawName ?? ''
  const description = rawDescription ?? ''
  const deadline = rawDeadline ?? ''
  let dbDeadline: string
  try {
    dbDeadline = userDateToDb(deadline)
  } catch {
    return { message: 'Invalid rock deadline. Expected MM/DD/YYYY.' }
  }

  try {
    const created = await createRock({ name, description, deadline: dbDeadline })
    logger.info('DataAgent', `rock created id=${created.id}`)
    return { message: `Rock created successfully: ${created.id}`, refreshBacklog: true }
  } catch (error) {
    if (error instanceof Error && (error.message.includes('cannot be in the past') || error.message.includes('must be on or after'))) {
      logger.warn('DataAgent', `guardrail blocked op="${input.operation}" reason="${error.message}"`)
      return { message: error.message }
    }

    return { message: 'Could not create rock right now. Please try again.' }
  }
}

// Handles 'create_sprint' operations.
async function handleCreateSprint(input: DataOperationInput) {
  const chunks = input.message.split('|').map((value) => value.trim())
  if (chunks.length < 5) {
    return {
      message: 'Format to create a sprint: create sprint | R-XXXX | Name | MM/DD/YYYY | MM/DD/YYYY'
    }
  }

  const [, rawRockId, rawName, rawStartDate, rawEndDate] = chunks
  const rockId = (rawRockId ?? '').toUpperCase()
  const name = rawName ?? ''
  const startDate = rawStartDate ?? ''
  const endDate = rawEndDate ?? ''
  let dbStartDate: string
  let dbEndDate: string
  try {
    dbStartDate = userDateToDb(startDate)
    dbEndDate = userDateToDb(endDate)
  } catch {
    return { message: 'Invalid sprint dates. Expected MM/DD/YYYY.' }
  }

  try {
    validateSprintDateOrder({ startDateDb: dbStartDate, endDateDb: dbEndDate })
  } catch (error) {
    return { message: error instanceof Error ? error.message : 'Invalid sprint date range.' }
  }

  try {
    const created = await createSprint({
      rockId,
      name,
      startDate: dbStartDate,
      endDate: dbEndDate
    })
    logger.info('DataAgent', `sprint created id=${created.id}`)
    return { message: `Sprint created successfully: ${created.id}`, refreshBacklog: true }
  } catch (error) {
    if (error instanceof Error && (error.message.includes('cannot be in the past') || error.message.includes('must be on or after'))) {
      logger.warn('DataAgent', `guardrail blocked op="${input.operation}" reason="${error.message}"`)
      return { message: error.message }
    }

    if (error instanceof Error && error.message.includes('does not exist')) {
      logger.warn('DataAgent', `guardrail blocked op="${input.operation}" reason="Rock ${rockId} does not exist."`)
      return { message: `Rock ${rockId} does not exist.` }
    }

    return { message: 'Could not create sprint right now. Please try again.' }
  }
}

// Handles 'delete_rock' operations.
async function handleDeleteRock(input: DataOperationInput) {
  if (!input.rockId) {
    return { message: 'Please provide the Rock ID. Example: delete rock R-AB12' }
  }

  const result = await deleteRock({ rockId: input.rockId })
  logger.info('DataAgent', `delete_rock result deleted=${result.deleted}`)
  if (result.deleted) {
    return { message: `Rock ${input.rockId} deleted`, refreshBacklog: true }
  }

  if (result.needsConfirmation) {
    const actionId = crypto.randomUUID()
    savePendingDelete(actionId, {
      sessionId: input.sessionId,
      rockId: input.rockId
    })

    return {
      message: result.reason,
      confirmation: {
        actionId,
        prompt: `Do you confirm deletion of ${input.rockId}?`
      }
    }
  }

  logger.warn('DataAgent', `guardrail blocked op="${input.operation}" reason="${result.reason ?? 'Could not delete the rock.'}"`)
  return { message: result.reason ?? 'Could not delete the rock.' }
}

// Handles 'confirm_delete' operations.
async function handleConfirmDelete(input: DataOperationInput) {
  const actionId = input.actionId
  const confirmed = Boolean(input.payload?.confirmed)

  if (!actionId) {
    return { message: 'No actionId was received to confirm deletion.' }
  }

  if (!confirmed) {
    takePendingDelete(actionId)
    return { message: 'Deletion canceled by user.' }
  }

  const pending = getPendingDelete(actionId)
  if (!pending) {
    return { message: 'The confirmation request has already expired.' }
  }

  // Enforce ownership: only the session that created this approval can consume it.
  if (pending.sessionId !== input.sessionId) {
    return { message: 'You are not authorized to confirm this deletion request.' }
  }

  // Consume only after ownership is validated.
  takePendingDelete(actionId)

  const result = await deleteRock({ rockId: pending.rockId, force: true })
  return {
    message: result.deleted ? `Rock ${pending.rockId} deleted with human approval.` : 'Could not delete the rock.',
    refreshBacklog: result.deleted
  }
}

// Handles 'approve_tasks' operations.
async function handleApproveTasks(input: DataOperationInput) {
  const actionId = input.actionId
  if (!actionId) {
    return { message: 'No actionId was received to approve tasks.' }
  }

  const pending = getPendingTasks(actionId)
  if (!pending) {
    return { message: 'The task proposal has expired or does not exist.' }
  }

  // Enforce ownership: only the session that created this approval can consume it.
  if (pending.sessionId !== input.sessionId) {
    return { message: 'You are not authorized to approve these tasks.' }
  }

  // Consume only after ownership is validated.
  takePendingTasks(actionId)

  const editedTasks = (input.payload?.tasks as ProposedTask[] | undefined) ?? pending.tasks
  const result = await batchCreateTasks({
    rockId: pending.rockId,
    sprintId: pending.sprintId,
    tasks: editedTasks
  })
  logger.info('DataAgent', `tasks approved count=${editedTasks.length}`)

  return {
    message: `Approved and stored ${result.created.length} tasks for ${pending.rockId}/${pending.sprintId}.`,
    refreshBacklog: true
  }
}

// Handles 'approve_plan' operations.
async function handleApprovePlan(input: DataOperationInput) {
  const actionId = input.actionId
  if (!actionId) {
    return { message: 'No actionId was received to approve plan.' }
  }

  const pending = getPendingPlan(actionId)
  // Require a valid pending approval before accepting any optional edits to the proposed plan.
  if (!pending) {
    return { message: 'The plan proposal has expired or does not exist.' }
  }

  // Enforce ownership: only the session that created this approval can consume it.
  if (pending.sessionId !== input.sessionId) {
    return { message: 'You are not authorized to approve this plan.' }
  }

  const overridePlan = input.payload?.plan as ProposedPlan | undefined
  const plan = overridePlan ?? pending.plan

  for (const sprint of plan.sprints) {
    let sprintStartDateDb: string
    let sprintEndDateDb: string

    try {
      sprintStartDateDb = normalizeDateToDb(sprint.startDate)
      sprintEndDateDb = normalizeDateToDb(sprint.endDate)
    } catch {
      return {
        message: `Invalid dates in sprint "${sprint.name}". Expected MM/DD/YYYY or YYYY-MM-DD for start and end dates.`
      }
    }

    try {
      validateSprintDateOrder({ startDateDb: sprintStartDateDb, endDateDb: sprintEndDateDb })
    } catch (error) {
      return {
        message: `Invalid date range in sprint "${sprint.name}": ${error instanceof Error ? error.message : 'Invalid date range.'}`
      }
    }
  }

  try {
    const saved = await savePlan({ plan })
    logger.info('DataAgent', `plan approved rockId=${saved.rockId}`)

    // Link the provisional document to the newly created rock if a tempId was provided.
    const docTempId = typeof input.payload?.tempId === 'string' ? input.payload.tempId : null
    if (docTempId) {
      await db
        .update(documents)
        .set({ rockId: saved.rockId })
        .where(eq(documents.tempId, docTempId))
    }

    // Consume only after the plan is successfully persisted.
    takePendingPlan(actionId)

    return {
      message: `Plan approved and saved: ${saved.rockId}, ${saved.sprintIds.length} sprints, ${saved.taskIds.length} tasks.`,
      refreshBacklog: true
    }
  } catch (error) {
    if (error instanceof Error && (error.message.includes('cannot be in the past') || error.message.includes('must be on or after'))) {
      return { message: error.message }
    }

    return {
      message: 'Could not save the approved plan right now. Your approval is still pending, so you can try again.'
    }
  }
}

// Handles 'list_backlog' operations.
async function handleListBacklog(input: DataOperationInput) {
  const backlog = await listBacklog()
  return {
    message: `Current backlog: ${backlog.rocks.length} rocks, ${backlog.sprints.length} sprints, ${backlog.tasks.length} tasks.`
  }
}

// Handles 'query_rock' operations.
async function handleQueryRock(input: DataOperationInput) {
  const entityId = input.rockId || input.payload?.rockId as string
  if (!entityId) {
    return { message: 'Please provide a Rock ID (e.g. R-XXXX) to query.' }
  }

  const rock = await queryRock(entityId)
  if (!rock) {
    return { message: `Rock ${entityId} not found.` }
  }

  const context = JSON.stringify(rock, null, 2)
  const message = await summarizeWithLLM(context, input.message)
  return { message }
}

// Handles 'query_sprint' operations.
async function handleQuerySprint(input: DataOperationInput) {
  const entityId = input.sprintId || input.payload?.sprintId as string
  if (!entityId) {
    return { message: 'Please provide a Sprint ID (e.g. S-XXXX) to query.' }
  }

  const sprint = await querySprint(entityId)
  if (!sprint) {
    return { message: `Sprint ${entityId} not found.` }
  }

  const context = JSON.stringify(sprint, null, 2)
  const message = await summarizeWithLLM(context, input.message)
  return { message }
}

// Handles 'query_task' operations.
async function handleQueryTask(input: DataOperationInput) {
  const entityId = input.taskId || input.payload?.taskId as string
  if (!entityId) {
    return { message: 'Please provide a Task ID (e.g. T-XXXX) to query.' }
  }

  const task = await queryTask(entityId)
  if (!task) {
    return { message: `Task ${entityId} not found.` }
  }

  const context = JSON.stringify(task, null, 2)
  const message = await summarizeWithLLM(context, input.message)
  return { message }
}

// Handles 'update_sprint_status' operations.
async function handleUpdateSprintStatus(input: DataOperationInput) {
  const sprintId = input.sprintId?.toUpperCase()
  if (!sprintId) {
    return { message: 'Please tell me which sprint to update. Example: "change status of S-ABCD"' }
  }

  const validSprintStatuses = ['planned', 'in_progress', 'completed', 'on_hold']
  
  // If status was passed via action payload (user clicked a button), apply it directly.
  const payloadStatus = typeof input.payload?.status === 'string' ? input.payload.status.toLowerCase().replace(/\s+/g, '_') : undefined
  const messageStatus = typeof input.status === 'string' ? input.status : undefined
  const status = payloadStatus ?? messageStatus

  if (!status || !validSprintStatuses.includes(status)) {
    // No status found — ask the user to pick one via buttons.
    return {
      message: `What status should sprint ${sprintId} be set to?`,
      statusPicker: {
        entityId: sprintId,
        entityType: 'sprint' as const
      }
    }
  }

  try {
    await updateSprintStatus({ sprintId, status: status as 'planned' | 'in_progress' | 'completed' | 'on_hold' })
    return { message: `Sprint ${sprintId} is now "${status.replace('_', ' ')}".`, refreshBacklog: true }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Could not update sprint status.'
    logger.warn('DataAgent', `guardrail blocked op="${input.operation}" reason="${reason}"`)
    return { message: error instanceof Error ? error.message : 'Could not update sprint status.' }
  }
}

// Handles 'update_task_status' operations.
async function handleUpdateTaskStatus(input: DataOperationInput) {
  const taskId = input.taskId?.toUpperCase()
  if (!taskId) {
    return { message: 'Please tell me which task to update. Example: "mark T-ABCD as done"' }
  }

  const validTaskStatuses = ['pending', 'in_progress', 'completed']
  
  const payloadStatus = typeof input.payload?.status === 'string' ? input.payload.status.toLowerCase().replace(/\s+/g, '_') : undefined
  const messageStatus = typeof input.status === 'string' ? input.status : undefined
  const status = payloadStatus ?? messageStatus

  if (!status || !validTaskStatuses.includes(status)) {
    return {
      message: `What status should task ${taskId} be set to?`,
      statusPicker: {
        entityId: taskId,
        entityType: 'task' as const
      }
    }
  }

  try {
    await updateTaskStatus({ taskId, status: status as 'pending' | 'in_progress' | 'completed' })
    return { message: `Task ${taskId} is now "${status.replace('_', ' ')}".`, refreshBacklog: true }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Could not update task status.'
    logger.warn('DataAgent', `guardrail blocked op="${input.operation}" reason="${reason}"`)
    return { message: error instanceof Error ? error.message : 'Could not update task status.' }
  }
}

// Handles 'modify_plan' operations.
async function handleModifyPlan(input: DataOperationInput) {
  logger.info('DataAgent', 'modify_plan - calling Gemini to update plan')

  const entry = findPendingPlanBySessionId(input.sessionId)
  if (!entry) {
    return { message: 'No pending plan found for this session. Ask me to generate a plan first.' }
  }

  const apiKey = useGeminiApiKey()
  const model = new ChatGoogleGenerativeAI({
    apiKey,
    model: 'gemini-2.5-flash',
    temperature: 0.2
  })

  const planJson = JSON.stringify(entry.data.plan, null, 2)
  const response = await model.invoke(`You are modifying a proposed plan based on user instructions.

Current plan (JSON):
${planJson}

User instruction: "${input.message}"

Instructions:
- Apply the requested modification: add or remove sprints or tasks.
- For new sprints: use empty string for name/startDate/endDate if not provided — the user will fill them in.
- For new tasks: use "TBD" for owner, same endDate as sprint for deadline, "medium" for priority, true for selected, if not specified.
- Return ONLY the modified plan as valid JSON matching the same structure. No extra text.
- Do NOT change anything not mentioned by the user.`)

  const content = typeof response.content === 'string' ? response.content : String(response.content)
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return { message: 'Could not parse the modified plan. Please try rephrasing your request.' }
  }

  let updatedPlan
  try {
    updatedPlan = JSON.parse(jsonMatch[0])
  } catch {
    return { message: 'Could not parse the modified plan. Please try rephrasing your request.' }
  }

  // Re-save with same actionId so approve_plan still works.
  savePendingPlan(entry.actionId, { sessionId: input.sessionId, plan: updatedPlan })

  return {
    response: 'Plan updated. Review the changes in the preview and approve when ready.',
    proposedPlan: updatedPlan,
    actionRequest: {
      type: 'approve_plan' as const,
      actionId: entry.actionId,
      prompt: 'Review the updated plan and approve or cancel.'
    }
  }
}

/**
 * Runs a data operation (CRUD actions on rocks, sprints, tasks) based on the operation type.
 * @param input - Input containing session ID, operation type, message, entity IDs, and payload
 * @returns Result object with message, refresh flags, confirmations, and status pickers
 */
export async function runDataOperation(input: DataOperationInput) {
  logger.info('DataAgent', `operation="${input.operation}"`)

  switch (input.operation) {
    case 'create_rock':          return handleCreateRock(input)
    case 'create_sprint':        return handleCreateSprint(input)
    case 'delete_rock':          return handleDeleteRock(input)
    case 'confirm_delete':       return handleConfirmDelete(input)
    case 'approve_tasks':        return handleApproveTasks(input)
    case 'approve_plan':         return handleApprovePlan(input)
    case 'list_backlog':         return handleListBacklog(input)
    case 'query_rock':           return handleQueryRock(input)
    case 'query_sprint':         return handleQuerySprint(input)
    case 'query_task':           return handleQueryTask(input)
    case 'update_sprint_status': return handleUpdateSprintStatus(input)
    case 'update_task_status':   return handleUpdateTaskStatus(input)
    case 'modify_plan':          return handleModifyPlan(input)

    default:
      return {
        message: 'Could not interpret the data operation. Use: create rock, create sprint, delete rock, list backlog.'
      }
  }
}
