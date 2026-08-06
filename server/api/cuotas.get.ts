import { listCuotas } from '~~/server/agents/tools/sql-tools'

/**
 * Handles GET /api/cuotas and returns fixed subscriptions sorted by newest first.
 * @returns Array of cuota records.
 * @throws Propagates database query errors when records cannot be fetched.
 */
export default eventHandler(async () => {
  return listCuotas()
})
