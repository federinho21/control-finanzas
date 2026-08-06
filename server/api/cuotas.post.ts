import { createError, eventHandler, readBody } from 'h3'
import { createCuota } from '~~/server/agents/tools/sql-tools'

/**
 * Handles POST /api/cuotas to create a fixed subscription.
 * @param event Nitro event containing the cuota payload.
 * @returns The created cuota id.
 * @throws {H3Error} Throws 400 when required fields are missing or invalid.
 */
export default eventHandler(async (event) => {
  const body = await readBody<{ nombre?: string; frecuencia?: string; monto?: string; categoria?: string }>(event)

  const nombre = body.nombre?.trim()
  const frecuencia = body.frecuencia?.trim().toLowerCase()
  const categoria = body.categoria?.trim()
  const monto = Number(String(body.monto ?? '').replace(',', '.'))

  if (!nombre) throw createError({ statusCode: 400, message: 'Cuota name is required.' })
  if (frecuencia !== 'mensual' && frecuencia !== 'anual') {
    throw createError({ statusCode: 400, message: 'Frequency must be "mensual" or "anual".' })
  }
  if (!Number.isFinite(monto) || monto <= 0) {
    throw createError({ statusCode: 400, message: 'Amount must be a positive number.' })
  }
  if (!categoria) throw createError({ statusCode: 400, message: 'Category is required.' })

  const created = await createCuota({ nombre, frecuencia, monto: String(monto), categoria })
  return { id: created.id }
})
