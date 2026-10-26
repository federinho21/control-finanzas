import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { getAgentRepository } from '../repositories/agent'
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
export async function judgeTaskCompletion(uid: string, taskId: string): Promise<JudgeResult> {
  logger.info('Judge', `evaluating taskId=${taskId}`)

  const task = await getAgentRepository().getTask(uid, taskId)
  if (!task) {
    return { isConsistent: true }
  }

  const matches = await searchDocuments(uid, `${task.description} pago factura comprobante`, 4)
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
    model: 'gemini-3.1-flash-lite',
    temperature: 0.1
  })

  const prompt = `The user is named Fede. Always address them as Fede.

You are a financial data-consistency judge. A movement has just been marked as "completed" (paid) in the system.
Your job is to check if uploaded financial documents (bank statements, invoices, receipts) contradict this status.

Movement: "${task.description}"
Category: ${task.owner}
Amount: ₡${Number(task.monto ?? 0).toFixed(2)}

Relevant document excerpts:
${context}

Answer with a JSON object only, no explanation:
{
  "isConsistent": true | false,
  "warning": "Short explanation if not consistent, otherwise null"
}

Return isConsistent: false only if there is strong evidence in the documents that this specific payment is still pending, unpaid, or was not made. Return isConsistent: true if uncertain.`

  const response = await model.invoke(prompt, { signal: AbortSignal.timeout(45000) })
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
