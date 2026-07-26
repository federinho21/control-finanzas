import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db'
import { sprints, tasks } from '~~/server/db/schema'
import { useGeminiApiKey } from '~~/server/composables/useGeminiApiKey'
import { logger } from '~~/server/utils/logger'

/**
 * Generates a retrospective summary for a sprint based on completed, in-progress, and pending tasks.
 * Provides a professional overview of team performance using an LLM-generated structured report.
 * @param sprintId The ID of the sprint to generate the retrospective for.
 * @returns A markdown-formatted retrospective summary string.
 */
export async function generateRetrospective(sprintId: string): Promise<string> {
  logger.info('Retro', `generating retrospective for sprintId=${sprintId}`)

  const sprint = await db.query.sprints.findFirst({ where: eq(sprints.id, sprintId) })
  if (!sprint) {
    return `Sprint ${sprintId} not found.`
  }

  const sprintTasks = await db.query.tasks.findMany({ where: eq(tasks.sprintId, sprintId) })
  logger.info('Retro', `sprint has ${sprintTasks.length} task(s) - calling Gemini`)

  if (sprintTasks.length === 0) {
    return `No tasks found for sprint ${sprintId}.`
  }

  const completed = sprintTasks.filter(t => t.status === 'completed')
  const inProgress = sprintTasks.filter(t => t.status === 'in_progress')
  const pending = sprintTasks.filter(t => t.status === 'pending')

  const taskSummary = sprintTasks
    .map(t => `- [${t.status.toUpperCase()}] ${t.description} (Owner: ${t.owner}, Priority: ${t.priority})`)
    .join('\n')

  const apiKey = useGeminiApiKey()
  const model = new ChatGoogleGenerativeAI({
    apiKey,
    model: 'gemini-2.5-flash',
    temperature: 0.4
  })

  const response = await model.invoke(`Generate a concise Sprint Retrospective summary for a team. 
Use a professional but friendly tone. Format it clearly with sections.

Sprint: ${sprint.name} (${sprint.startDate} → ${sprint.endDate})
Rock ID: ${sprint.rockId}
Status: ${sprint.status}

Task breakdown:
- Total: ${sprintTasks.length}
- Completed: ${completed.length}
- In Progress: ${inProgress.length}
- Pending: ${pending.length}

Tasks:
${taskSummary}

Write the retrospective with these sections:
1. **Summary** — one sentence overview
2. **Delivered** — what was completed
3. **Blockers / Pending** — what wasn't done and why (infer from data)
4. **Team Performance** — owners who delivered
5. **Recommendation** — one concrete next step

Keep it under 200 words.`)

  logger.info('Retro', 'retrospective generated')
  return String(response.content)
}
