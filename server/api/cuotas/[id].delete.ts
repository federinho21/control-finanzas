import { createError, eventHandler } from 'h3'
import { deleteCuota } from '~~/server/agents/tools/sql-tools'

/**
 * Handles DELETE /api/cuotas/:id to remove a fixed subscription.
 * @param event Nitro event containing the cuota id route param.
 * @returns The deletion result.
 * @throws {H3Error} Throws 404 when the cuota does not exist.
 */
export default eventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Cuota ID is required.' })
  }

  const result = await deleteCuota(id)
  if (!result.deleted) {
    throw createError({ statusCode: 404, message: 'Cuota not found.' })
  }

  return { ok: true }
})
