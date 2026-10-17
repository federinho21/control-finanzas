import { createWebSession, type WebAuthState } from '~/utils/web-session'

export default defineNuxtPlugin(nuxtApp => {
  const state = useState<WebAuthState>('auth-state', () => ({ user: null, ready: false, busy: false, error: '', logoutUnconfirmed: false }))
  if (import.meta.client) state.value.ready = false
  const request = useRequestFetch()
  const reset = () => nuxtApp.runWithContext(() => {
    const defaults: Record<string, unknown> = {
      rocks: [], sprints: [], tasks: [], cuotas: [], 'backlog-loading': false,
      'monthly-resumen': null, 'monthly-resumen-loading': false,
      'chat-session-id': crypto.randomUUID(), 'chat-messages': [], 'chat-pending': false,
      'chat-reconnecting': false, 'chat-pending-query': null,
      'plan-preview-plan': null, 'plan-preview-action-id': null, 'plan-preview-temp-id': null
    }
    for (const [key, value] of Object.entries(defaults)) useState(key).value = value
    clearNuxtData('finance-dashboard')
  })
  const session = createWebSession(state.value, {
    me: () => request('/api/auth/me', { credentials: 'include', retry: 0 }),
    googleToken: () => nuxtApp.$googleSignIn(),
    create: idToken => request('/api/auth/session', { method: 'POST', body: { idToken }, credentials: 'include', retry: 0 }),
    remove: () => request('/api/auth/session', { method: 'DELETE', credentials: 'include', retry: 0 }),
    reset,
    expired: () => {
      if (import.meta.client) void nuxtApp.runWithContext(() => navigateTo('/login'))
    }
  })
  // shortcut: without BroadcastChannel tabs revalidate on navigation/401; add a fallback if immediate sync is required.
  const channel = import.meta.client && typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('control-finanzas-auth') : null
  if (channel) {
    channel.onmessage = async ({ data }) => {
      if (!['logout-started', 'signed-out', 'session-changed'].includes(data)) return
      session.invalidate()
      state.value.logoutUnconfirmed = data === 'logout-started'
      if (data === 'session-changed') await session.restore(true)
      await nuxtApp.runWithContext(() => navigateTo(state.value.user ? '/' : '/login'))
    }
  }
  return { provide: { authSession: {
    ...session,
    async signIn() {
      const success = await session.signIn()
      if (success) channel?.postMessage('session-changed')
      return success
    },
    async logout() {
      if (state.value.busy) return false
      const result = session.logout()
      channel?.postMessage('logout-started')
      const success = await result
      if (success) channel?.postMessage('signed-out')
      return success
    }
  } } }
})
