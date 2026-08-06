import { createError, eventHandler, getQuery } from 'h3'
import { monthlySummary } from '~~/server/agents/tools/sql-tools'

/**
 * Handles GET /api/resumen and returns the monthly financial summary.
 * @param event Nitro event with required mes=YYYY-MM query param.
 * @returns Aggregated summary with ingresos, gastos, retiros, balance, and movements.
 * @throws {H3Error} Throws 400 when the mes query param is missing or malformed.
 */
export default eventHandler(async (event) => {
  const query = getQuery(event)
  const mes = typeof query.mes === 'string' ? query.mes : undefined

  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    throw createError({ statusCode: 400, message: 'Missing or invalid "mes" query param. Expected YYYY-MM.' })
  }

  return monthlySummary(mes)
})
