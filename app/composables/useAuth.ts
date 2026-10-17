import type { WebAuthState } from '~/utils/web-session'

export function useAuth() {
  const state = useState<WebAuthState>('auth-state')
  const session = useNuxtApp().$authSession
  return {
    ...session,
    user: computed(() => state.value.user),
    ready: computed(() => state.value.ready),
    busy: computed(() => state.value.busy),
    error: computed(() => state.value.error),
    logoutUnconfirmed: computed(() => state.value.logoutUnconfirmed)
  }
}
