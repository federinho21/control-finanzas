import { eq } from 'drizzle-orm'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { db } from '~~/server/db'
import { rocks, sprints } from '~~/server/db/schema'
import { useGeminiApiKey } from '~~/server/composables/useGeminiApiKey'
import type { ProposedTask } from '~~/shared/types/task'
import { normalizeDateToUser } from '~~/shared/utils/date'

/**
 * Generates fallback tasks when LLM planning fails or returns invalid results.
 * @param sprintStart - Sprint start date in DB format (YYYY-MM-DD)
 * @param sprintEnd - Sprint end date in DB format (YYYY-MM-DD)
 * @returns Array of two basic planning tasks
 */
function fallbackTasks(sprintStart: string, sprintEnd: string): ProposedTask[] {
  const start = normalizeDateToUser(sprintStart)
  const end = normalizeDateToUser(sprintEnd)

  return [
    {
      description: 'Map the current state and main pain points',
      owner: 'Product',
      deadline: start,
      priority: 'high',
      selected: true
    },
    {
      description: 'Define executable scope and sprint risks',
      owner: 'Tech Lead',
      deadline: end,
      priority: 'high',
      selected: true
    }
  ]
}

/**
 * Generates proposed tasks for a specific rock and sprint using LLM planning.
 * @param input - Input containing user message, rock ID, and sprint ID
 * @returns Array of proposed tasks with descriptions, owners, deadlines, and priorities
 * @throws Error if rock ID or sprint ID is missing, or entities don't exist
 */
export async function generateProposedTasks(input: {
  message: string
  rockId?: string
  sprintId?: string
}) {
  if (!input.rockId || !input.sprintId) {
    throw new Error('Include IDs in the message to plan tasks. Example: Break down R-AB12 for S-CD34')
  }

  const rock = await db.query.rocks.findFirst({ where: eq(rocks.id, input.rockId) })
  const sprint = await db.query.sprints.findFirst({ where: eq(sprints.id, input.sprintId) })

  if (!rock) {
    throw new Error(`Rock ${input.rockId} does not exist`)
  }

  if (!sprint) {
    throw new Error(`Sprint ${input.sprintId} does not exist`)
  }

  if (sprint.rockId !== rock.id) {
    throw new Error(`Sprint ${sprint.id} does not belong to Rock ${rock.id}`)
  }

  const apiKey = useGeminiApiKey()

  try {
    const sprintStartForUser = normalizeDateToUser(sprint.startDate)
    const sprintEndForUser = normalizeDateToUser(sprint.endDate)
    const rockDeadlineForUser = normalizeDateToUser(rock.deadline)

    const model = new ChatGoogleGenerativeAI({
      apiKey,
      model: 'gemini-2.5-flash',
      temperature: 0.2
    })

    const prompt = `
You are a Scrum Planner. Respond with valid JSON only using this exact format:
{
  "tasks": [
    {"description":"...","owner":"...","deadline":"MM/DD/YYYY","priority":"high|medium|low"}
  ]
}

Rules:
- Generate between 3 and 6 tasks
- Deadline must be between ${sprintStartForUser} and ${sprintEndForUser}
- Do not add extra fields

Rock:
- id: ${rock.id}
- name: ${rock.name}
- description: ${rock.description}
- deadline: ${rockDeadlineForUser}

User request: ${input.message}
`

    const response = await model.invoke(prompt)
    const content = String(response.content)
    const jsonText = content.match(/\{[\s\S]*\}/)?.[0]

    if (!jsonText) {
      return fallbackTasks(sprint.startDate, sprint.endDate)
    }

    const parsed = JSON.parse(jsonText) as { tasks?: ProposedTask[] }
    const tasks = (parsed.tasks ?? [])
      .slice(0, 6)
      .flatMap((task) => {
        try {
          return [{
            description: task.description,
            owner: task.owner || 'Team',
            deadline: normalizeDateToUser(task.deadline),
            priority: task.priority || 'medium',
            selected: true
          }]
        } catch {
          return []
        }
      })
      .filter((task) => task.description && task.deadline)

    if (tasks.length === 0) {
      return fallbackTasks(sprint.startDate, sprint.endDate)
    }

    return tasks
  } catch {
    return fallbackTasks(sprint.startDate, sprint.endDate)
  }
}
