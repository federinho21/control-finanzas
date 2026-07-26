import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db'
import { tasks } from '~~/server/db/schema'
import { searchDocuments } from './tools/rag-tools'
import { useGeminiApiKey } from '~~/server/composables/useGeminiApiKey'
import { logger } from '~~/server/utils/logger'

export interface JudgeResult {
  isConsistent: boolean
  warning?: string
}

/**
 * Checks whether the "completed" status of a task is consistent with uploaded documents.
 * Searches ingested documents for contradictions suggesting the task is blocked, pending, or incomplete.
 * @param taskId The ID of the task to evaluate.
 * @returns An object indicating consistency and an optional warning message.
 */
export async function judgeTaskCompletion(taskId: string): Promise<JudgeResult> {
  logger.info('Judge', `evaluating taskId=${taskId}`)

  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) })
  if (!task) {
    return { isConsistent: true }
  }

  const matches = await searchDocuments(`${task.description} blocked incomplete pending`, 4)
  logger.info('Judge', `found ${matches.length} relevant chunk(s)`)
  if (matches.length === 0) {
    return { isConsistent: true }
  }

  const context = matches
    .map((m, i) => `Source ${i + 1} (score ${m.score.toFixed(3)}):\n${m.chunkText}`)
    .join('\n\n')

  const apiKey = useGeminiApiKey()
  const model = new ChatGoogleGenerativeAI({
    apiKey,
    model: 'gemini-2.5-flash',
    temperature: 0.1
  })

  const prompt = `You are a data-consistency judge. A task has just been marked as "completed" in the system.
Your job is to check if uploaded documents or meeting transcripts contradict this status.

Task: "${task.description}"
Owner: ${task.owner}

Relevant document excerpts:
${context}

Answer with a JSON object only, no explanation:
{
  "isConsistent": true | false,
  "warning": "Short explanation if not consistent, otherwise null"
}

Return isConsistent: false only if there is strong evidence in the documents that this specific task is still blocked, pending, or not done. Return isConsistent: true if uncertain.`

  const response = await model.invoke(prompt)
  const text = String(response.content).trim()

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return { isConsistent: true }
    const parsed = JSON.parse(jsonMatch[0])
    const result = {
      isConsistent: parsed.isConsistent === true,
      warning: parsed.warning || undefined
    }
    logger.info('Judge', `verdict isConsistent=${result.isConsistent}`)
    return result
  } catch {
    return { isConsistent: true }
  }
}
