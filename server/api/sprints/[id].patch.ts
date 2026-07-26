import { eventHandler } from 'h3'

/**
 * Handles PATCH /api/sprints/:id and rejects manual sprint status updates.
 * @param _event Nitro event containing the route parameter and request payload.
 * @returns This handler does not return a success payload.
 * @throws {H3Error} Always throws 405 because sprint status is derived automatically.
 */
export default eventHandler(async (_event) => {
  throw createError({
    statusCode: 405,
    statusMessage: 'Sprint status is automatically derived from task statuses and cannot be updated manually.'
  })
})
