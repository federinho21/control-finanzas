import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import type { ProposedPlan, ProposedSprint } from '~~/shared/types/plan'
import type { ProposedTask, TaskPriority } from '~~/shared/types/task'
import { normalizeDateToDb, normalizeDateToUser } from '~~/shared/utils/date'
import { useGeminiApiKey } from '~~/server/composables/useGeminiApiKey'

/**
 * Formats Date objects into user-facing MM/DD/YYYY strings.
 * @param value - The Date object to format
 * @returns Date string in MM/DD/YYYY format
 */
function toUserDate(value: Date): string {
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  const year = value.getFullYear()
  return `${month}/${day}/${year}`
}

/**
 * Creates a new Date by adding whole days to a base date.
 * @param base - The base Date
 * @param days - Number of days to add (can be negative)
 * @returns A new Date object with the days added
 */
function addDays(base: Date, days: number): Date {
  const result = new Date(base)
  result.setDate(result.getDate() + days)
  return result
}

/**
 * Converts a Date into a comparable DB date string (YYYY-MM-DD) using shared validators.
 * @param value - The Date object to convert
 * @returns Date string in YYYY-MM-DD format
 */
function toDbDate(value: Date): string {
  return normalizeDateToDb(toUserDate(value))
}

/**
 * Returns today's local date in DB format for lexicographic comparisons.
 * @returns Today's date string in YYYY-MM-DD format
 */
function getTodayDbDate(): string {
  return toDbDate(new Date())
}

/**
 * Parses a date-like value (MM/DD/YYYY or YYYY-MM-DD) and falls back safely when invalid.
 * @param value - The date value to parse
 * @param fallbackDbDate - Fallback date in DB format (YYYY-MM-DD)
 * @returns Normalized date in DB format (YYYY-MM-DD)
 */
function sanitizeToDbDate(value: unknown, fallbackDbDate: string): string {
  const raw = String(value ?? '').trim()
  if (!raw) {
    return fallbackDbDate
  }

  try {
    return normalizeDateToDb(raw)
  } catch {
    return fallbackDbDate
  }
}

/**
 * Clamps a DB date between an inclusive minimum and optional inclusive maximum.
 * @param dateDb - The date to clamp in DB format (YYYY-MM-DD)
 * @param minDb - Minimum allowed date in DB format
 * @param maxDb - Optional maximum allowed date in DB format
 * @returns Clamped date in DB format
 */
function clampDbDate(dateDb: string, minDb: string, maxDb?: string): string {
  if (dateDb < minDb) {
    return minDb
  }

  if (maxDb && dateDb > maxDb) {
    return maxDb
  }

  return dateDb
}

/**
 * Normalizes priority values into the supported priority union.
 * @param value - The priority value to normalize
 * @returns A valid TaskPriority ('high', 'medium', or 'low')
 */
function normalizePriority(value: unknown): TaskPriority {
  const raw = String(value ?? '').toLowerCase()
  if (raw === 'high' || raw === 'medium' || raw === 'low') {
    return raw
  }

  return 'medium'
}

/**
 * Normalizes task fields while preserving ProposedTask compatibility.
 * @param value - The raw task object
 * @param fallbackDeadlineDb - Fallback deadline in DB format
 * @param todayDb - Today's date in DB format
 * @param sprintStartDb - Sprint start date in DB format
 * @param sprintEndDb - Sprint end date in DB format
 * @returns Normalized ProposedTask with validated fields
 */
function normalizeTask(
  value: unknown,
  fallbackDeadlineDb: string,
  todayDb: string,
  sprintStartDb: string,
  sprintEndDb: string
): ProposedTask {
  const task = (value ?? {}) as Partial<ProposedTask>
  const description = String(task.description ?? '').trim() || 'Movimiento financiero'
  const owner = String(task.owner ?? '').trim() || 'General'
  const rawDeadlineDb = sanitizeToDbDate(task.deadline, fallbackDeadlineDb)
  const windowStartDb = sprintStartDb > todayDb ? sprintStartDb : todayDb
  const deadlineDb = clampDbDate(rawDeadlineDb, windowStartDb, sprintEndDb)
  const rawMonto = String(task.monto ?? '0').replace(',', '.')
  const monto = Number.isFinite(Number(rawMonto)) && Number(rawMonto) > 0 ? Number(rawMonto).toFixed(2) : '0.00'
  const tipo = task.tipo === 'ingreso' || task.tipo === 'retiro' ? task.tipo : 'gasto'

  return {
    description,
    owner,
    deadline: normalizeDateToUser(deadlineDb),
    priority: normalizePriority(task.priority),
    selected: task.selected !== false,
    monto,
    tipo
  }
}

/**
 * Rebalances priorities when an entire sprint is generated with a single priority.
 * @param tasks - Array of proposed tasks
 * @returns Array of tasks with balanced priorities (high, medium, low rotation)
 */
function rebalanceSprintPriorities(tasks: ProposedTask[]): ProposedTask[] {
  const uniquePriorities = new Set(tasks.map((task) => task.priority))
  if (uniquePriorities.size !== 1) {
    return tasks
  }

  const cycle: TaskPriority[] = ['high', 'medium', 'low']
  return tasks.map((task, index) => ({
    ...task,
    priority: cycle[index % cycle.length] ?? 'medium'
  }))
}

/**
 * Returns the number of days between two DB date strings (YYYY-MM-DD).
 * @param fromDb - Start date in DB format
 * @param toDb - End date in DB format
 * @returns Number of days between the dates (minimum 0)
 */
function daysBetween(fromDb: string, toDb: string): number {
  const from = new Date(fromDb)
  const to = new Date(toDb)
  return Math.max(Math.round((to.getTime() - from.getTime()) / 86400000), 0)
}

/**
 * Adds days to a DB date string and returns a DB date string.
 * @param dateDb - The date in DB format (YYYY-MM-DD)
 * @param days - Number of days to add
 * @returns New date in DB format (YYYY-MM-DD)
 */
function addDaysToDb(dateDb: string, days: number): string {
  return toDbDate(addDays(new Date(dateDb), days))
}

/**
 * Normalizes sprint data and enforces post-processing safety rules.
 * @param value - The raw sprint object
 * @param index - Sprint index in the plan
 * @param totalSprints - Total number of sprints in the plan
 * @param todayDb - Today's date in DB format
 * @param rockDeadlineDb - Rock deadline in DB format
 * @returns Normalized ProposedSprint with validated fields
 */
function normalizeSprint(
  value: unknown,
  index: number,
  totalSprints: number,
  todayDb: string,
  rockDeadlineDb: string
): ProposedSprint {
  const sprint = (value ?? {}) as {
    name?: string
    startDate?: string
    endDate?: string
    tasks?: unknown[]
  }

  // Distribute fallback dates evenly across the rock timeline.
  const totalDays = daysBetween(todayDb, rockDeadlineDb)
  const segmentDays = Math.max(Math.floor(totalDays / totalSprints), 7)
  const fallbackStartDb = addDaysToDb(todayDb, index * segmentDays)
  const fallbackEndDb = index === totalSprints - 1
    ? rockDeadlineDb
    : addDaysToDb(todayDb, (index + 1) * segmentDays - 1)

  // Respect LLM dates but enforce boundaries.
  const rawStartDb = sanitizeToDbDate(sprint.startDate, fallbackStartDb)
  const rawEndDb = sanitizeToDbDate(sprint.endDate, fallbackEndDb)

  // startDate: must be >= today and <= rockDeadline
  const startDb = clampDbDate(rawStartDb, todayDb, rockDeadlineDb)
  // endDate: must be >= startDate and <= rockDeadline
  const endDb = clampDbDate(rawEndDb, startDb, rockDeadlineDb)

  const tasks = Array.isArray(sprint.tasks)
    ? sprint.tasks.slice(0, 8).map((task) =>
        normalizeTask(task, endDb, todayDb, startDb, endDb)
      )
    : []

  return {
    name: String(sprint.name ?? '').trim() || `Sprint ${index + 1}`,
    startDate: normalizeDateToUser(startDb),
    endDate: normalizeDateToUser(endDb),
    tasks: rebalanceSprintPriorities(tasks)
  }
}

/**
 * Validates minimum structural requirements expected from the model output.
 * @param value - The value to validate
 * @throws Error if the structure is invalid
 */
function validatePlanShape(value: unknown): asserts value is {
  rock: { name?: unknown; description?: unknown; deadline?: unknown }
  sprints: Array<{
    name?: unknown
    startDate?: unknown
    endDate?: unknown
    tasks?: unknown
  }>
} {
  if (!value || typeof value !== 'object') {
    throw new Error('model output must be a JSON object')
  }

  const parsed = value as {
    rock?: unknown
    sprints?: unknown
  }

  if (!parsed.rock || typeof parsed.rock !== 'object') {
    throw new Error('rock is required')
  }

  if (!Array.isArray(parsed.sprints) || parsed.sprints.length < 1 || parsed.sprints.length > 3) {
    throw new Error('sprints must contain between 1 and 3 items')
  }

  parsed.sprints.forEach((sprint, sprintIndex) => {
    if (!sprint || typeof sprint !== 'object') {
      throw new Error(`sprint ${sprintIndex + 1} must be an object`)
    }

    const sprintObject = sprint as { tasks?: unknown }
    if (!Array.isArray(sprintObject.tasks) || sprintObject.tasks.length < 3 || sprintObject.tasks.length > 8) {
      throw new Error(`sprint ${sprintIndex + 1} must contain between 3 and 8 tasks`)
    }
  })
}

/**
 * Normalizes validated model output into the ProposedPlan contract.
 * @param value - The raw plan object from the LLM
 * @returns Normalized ProposedPlan with validated rock, sprints, and tasks
 * @throws Error if validation fails
 */
function normalizePlan(value: unknown): ProposedPlan {
  validatePlanShape(value)

  const parsed = value as {
    rock: { name?: string; description?: string; deadline?: string }
    sprints: unknown[]
  }

  const now = new Date()
  const todayDb = getTodayDbDate()
  const fallbackRockDeadlineDb = toDbDate(addDays(now, 42))
  const rock = parsed.rock
  const rockDeadlineDb = clampDbDate(sanitizeToDbDate(rock.deadline, fallbackRockDeadlineDb), todayDb)

  const normalizedSprints = parsed.sprints.map((sprint, index) =>
    normalizeSprint(sprint, index, parsed.sprints.length, todayDb, rockDeadlineDb)
  )

  return {
    rock: {
      name: String(rock.name ?? '').trim() || 'Personal Budget',
      description: String(rock.description ?? '').trim() || 'AI-generated monthly budget plan',
      deadline: normalizeDateToUser(rockDeadlineDb)
    },
    sprints: normalizedSprints
  }
}

/**
 * Extracts the first JSON object from model text responses.
 * @param content - The model output text
 * @returns The extracted JSON string, or null if not found
 */
function extractJson(content: string): string | null {
  const direct = content.trim()
  if (direct.startsWith('{') && direct.endsWith('}')) {
    return direct
  }

  const block = content.match(/\{[\s\S]*\}/)?.[0]
  return block ?? null
}

/**
 * Generates a full strategic proposal (rock, sprints, tasks) without writing to the database.
 * @param input - Input containing the user's strategic planning message
 * @returns A complete ProposedPlan ready for approval
 * @throws Error if LLM generation fails or returns invalid structure
 */
export async function generateProposedPlan(input: {
  message: string
}): Promise<ProposedPlan> {
  const apiKey = useGeminiApiKey()

  const model = new ChatGoogleGenerativeAI({
    apiKey,
    model: 'gemini-3.1-flash-lite',
    temperature: 0.2
  })

  const todayUserDate = toUserDate(new Date())

  const prompt = `
The user is named Fede. Always address them as Fede.

You are a personal finance planner. Return strict JSON only, with no markdown fences and no extra text.
The user may write in any language. You must understand the user's language.
Output ALL fields in English.

Today's date: ${todayUserDate}

Output format:
{
  "rock": {
    "name": "string",
    "description": "string",
    "deadline": "MM/DD/YYYY"
  },
  "sprints": [
    {
      "name": "string",
      "startDate": "MM/DD/YYYY",
      "endDate": "MM/DD/YYYY",
      "tasks": [
        {
          "description": "string",
          "owner": "category",
          "deadline": "MM/DD/YYYY",
          "priority": "high|medium|low",
          "monto": "0.00",
          "tipo": "ingreso|gasto|retiro",
          "selected": true
        }
      ]
    }
  ]
}

Financial domain rules:
- The "rock" represents a financial account or budget goal (e.g. "Personal Budget", "Savings Goal").
- Each "sprint" represents a monthly period (e.g. "August 2026"). 1 to 3 periods, sequential and non-overlapping.
- Each "task" represents a budgeted movement: expenses (gasto), income (ingreso), or withdrawals (retiro).
- "owner" must be a spending category (e.g. Rent, Groceries, Transport, Salary, Savings, Entertainment).
- "monto" is the amount in a fixed-2-decimal string (e.g. "500.00"). Must be greater than 0.
- Balance the movements so the budget is realistic: include both income (ingreso) and expenses (gasto).
- Keep the account deadline 30-90 days from today. Periods must fit inside that range.
- Every movement.deadline must be within [sprint.startDate, sprint.endDate] of the period it belongs to.
- Do not place all deadlines on the same day. Distribute movements across the period.

Other rules:
- Include exactly 1 rock.
- Include between 1 and 3 sprints.
- Include 3 to 8 tasks per sprint.
- Use mixed priorities across each sprint (do not make all tasks high priority).
- Always include the "selected" field for every task.
- Always include "monto" and "tipo" for every task.

User request:
${input.message}
`

  let content = ''
  try {
    const response = await model.invoke(prompt, { signal: AbortSignal.timeout(45000) })
    content = String(response.content)
  } catch {
    throw new Error('Strategy plan generation failed: unable to get a response from the LLM.')
  }

  const jsonText = extractJson(content)

  if (!jsonText) {
    throw new Error('Strategy plan generation failed: model response did not contain valid JSON.')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText) as unknown
  } catch {
    throw new Error('Strategy plan generation failed: model response JSON could not be parsed.')
  }

  try {
    return normalizePlan(parsed)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'invalid output shape'
    throw new Error(`Strategy plan generation failed: ${detail}.`)
  }
}
