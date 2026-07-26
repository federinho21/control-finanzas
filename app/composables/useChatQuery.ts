import { useState } from '#imports'

/**
 * Shared state for triggering a chat query from anywhere in the app (e.g. backlog cards).
 * 
 * @returns An object containing the pending query state and methods to trigger or consume it.
 */
export function useChatQuery() {
  const pendingQuery = useState<string | null>('chat-pending-query', () => null)

  /**
   * Dispara una nueva consulta en el estado compartido
   */
  function triggerQuery(query: string) {
    pendingQuery.value = query
  }

  /**
   * Consume y limpia la consulta pendiente actual
   */
  function consumeQuery(): string | null {
    const q = pendingQuery.value
    pendingQuery.value = null
    return q
  }

  return { pendingQuery, triggerQuery, consumeQuery }
}
