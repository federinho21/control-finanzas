import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { getAgentRepository } from '../repositories/agent'
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
      description: 'Planificar gastos básicos del período',
      owner: 'General',
      deadline: start,
      priority: 'high',
      selected: true,
      monto: '0.00',
      tipo: 'gasto'
    },
    {
      description: 'Registrar ingresos proyectados del período',
      owner: 'Ingresos',
      deadline: end,
      priority: 'high',
      selected: true,
      monto: '0.00',
      tipo: 'ingreso'
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
  uid: string
  message: string
  rockId?: string
  sprintId?: string
}) {
  if (!input.rockId || !input.sprintId) {
    throw new Error('Include IDs in the message to plan tasks. Example: Break down R-AB12 for S-CD34')
  }

  const rock = await getAgentRepository().getRock(input.uid, input.rockId)
  const sprint = await getAgentRepository().getSprint(input.uid, input.sprintId)

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
      model: 'gemini-3.1-flash-lite',
      temperature: 0.2
    })

    const prompt = `
The user is named Fede. Always address them as Fede.

You are a Personal Finance Planner. Respond with valid JSON only using this exact format:
{
  "tasks": [
    {"description":"...","owner":"category","deadline":"MM/DD/YYYY","priority":"high|medium|low","monto":"0.00","tipo":"ingreso|gasto|retiro"}
  ]
}

Rules:
- Generate between 3 and 6 movements
- Deadline must be between ${sprintStartForUser} and ${sprintEndForUser}
- "owner" must be a spending category (e.g. Rent, Groceries, Transport, Salary)
- "monto" is a fixed-2-decimal amount string greater than 0 (e.g. "250.00")
- "tipo" is one of: ingreso (income), gasto (expense), retiro (withdrawal)
- Do not add extra fields

Account:
- id: ${rock.id}
- name: ${rock.name}
- description: ${rock.description}
- deadline: ${rockDeadlineForUser}

User request: ${input.message}
`

    const response = await model.invoke(prompt, { signal: AbortSignal.timeout(45000) })
    const content = String(response.content)
    const jsonText = content.match(/\{[\s\S]*\}/)?.[0]

    if (!jsonText) {
      return fallbackTasks(sprint.startDate, sprint.endDate)
    }

    const parsed = JSON.parse(jsonText) as { tasks?: ProposedTask[] }
    const tasks: ProposedTask[] = (parsed.tasks ?? [])
      .slice(0, 6)
      .flatMap<ProposedTask>((task) => {
        try {
          const rawMonto = String(task.monto ?? '0').replace(',', '.')
          return [{
            description: task.description,
            owner: task.owner || 'General',
            deadline: normalizeDateToUser(task.deadline),
            priority: task.priority || 'medium',
            selected: true,
            monto: Number.isFinite(Number(rawMonto)) && Number(rawMonto) > 0 ? Number(rawMonto).toFixed(2) : '0.00',
            tipo: task.tipo === 'ingreso' || task.tipo === 'retiro' ? task.tipo : 'gasto'
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
