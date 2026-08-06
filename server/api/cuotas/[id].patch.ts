import { createError, eventHandler, readBody } from 'h3'
import { markCuotaPagada } from '~~/server/agents/tools/sql-tools'

/**
 * Handles PATCH /api/cuotas/:id to mark a cuota as paid.
 * @param event Nitro event containing the cuota id route param.
 * @returns The updated cuota record.
 * @throws {H3Error} Throws 400/404 for invalid input or missing cuota.
 */
export default eventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Cuota ID is required.' })
  }

  const body = await readBody<{ action?: string; rockId?: string }>(event)
  if (body.action && body.action !== 'marcar_pagada') {
    throw createError({ statusCode: 400, message: 'Invalid action. Use "marcar_pagada".' })
  }

  const updated = await markCuotaPagada({ cuotaId: id, rockId: body.rockId })
  return updated
})
