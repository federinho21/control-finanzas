import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db'
import { sprints, tasks } from '~~/server/db/schema'
import { useGeminiApiKey } from '~~/server/composables/useGeminiApiKey'
import { logger } from '~~/server/utils/logger'

/**
 * Generates a monthly financial analysis for a period (sprint) based on its movements.
 * Provides an overview of income, expenses, withdrawals, and balance using an LLM-generated structured report.
 * @param sprintId The ID of the period (sprint) to analyze.
 * @returns A markdown-formatted monthly analysis string.
 */
export async function generateRetrospective(sprintId: string): Promise<string> {
  logger.info('Retro', `generating monthly analysis for sprintId=${sprintId}`)

  const sprint = await db.query.sprints.findFirst({ where: eq(sprints.id, sprintId) })
  if (!sprint) {
    return `Period ${sprintId} not found.`
  }

  const sprintTasks = await db.query.tasks.findMany({ where: eq(tasks.sprintId, sprintId) })
  logger.info('Retro', `period has ${sprintTasks.length} movement(s) - calling Gemini`)

  if (sprintTasks.length === 0) {
    return `No movements found for period ${sprintId}.`
  }

  const ingresos = sprintTasks.filter(t => t.tipo === 'ingreso')
  const gastos = sprintTasks.filter(t => t.tipo === 'gasto')
  const retiros = sprintTasks.filter(t => t.tipo === 'retiro')

  const totalIngresos = ingresos.reduce((s, t) => s + Number(t.monto ?? 0), 0)
  const totalGastos = gastos.reduce((s, t) => s + Number(t.monto ?? 0), 0)
  const totalRetiros = retiros.reduce((s, t) => s + Number(t.monto ?? 0), 0)
  const balance = totalIngresos - totalGastos - totalRetiros

  const taskSummary = sprintTasks
    .map(t => `- [${t.tipo.toUpperCase()}] ₡${Number(t.monto ?? 0).toFixed(2)} ${t.description} (Categoría: ${t.owner})`)
    .join('\n')

  const apiKey = useGeminiApiKey()
  const model = new ChatGoogleGenerativeAI({
    apiKey,
    model: 'gemini-3.6-flash',
    temperature: 0.4
  })

  const response = await model.invoke(`The user is named Fede. Always address them as Fede.

Generate a concise monthly financial analysis for a personal budget.
Use a professional but friendly tone. Format it clearly with sections.

Period: ${sprint.name} (${sprint.startDate} → ${sprint.endDate})
Account ID: ${sprint.rockId}
Status: ${sprint.status}

Movement breakdown:
- Total: ${sprintTasks.length}
- Ingresos (income): ${ingresos.length}
- Gastos (expenses): ${gastos.length}
- Retiros (withdrawals): ${retiros.length}
- Total income: ₡${totalIngresos.toFixed(2)}
- Total expenses: ₡${totalGastos.toFixed(2)}
- Total withdrawals: ₡${totalRetiros.toFixed(2)}
- Balance: ₡${balance.toFixed(2)}

Movements:
${taskSummary}

Write the analysis with these sections:
1. **Resumen** — one sentence overview of the month
2. **Ingresos** — main income sources
3. **Gastos** — where the money went (top categories)
4. **Retiros / Riesgos** — unusual withdrawals or concerns
5. **Recomendación** — one concrete next step to improve the balance

Keep it under 200 words. Respond in the same language as the user's request if it is not English.`)

  logger.info('Retro', 'monthly analysis generated')
  return String(response.content)
}
