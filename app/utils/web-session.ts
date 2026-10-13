export interface WebUser { uid: string; email?: string; name?: string }
export interface WebAuthState {
  user: WebUser | null
  ready: boolean
  busy: boolean
  error: string
  logoutUnconfirmed: boolean
}

export class SessionChangedError extends Error {
  constructor() { super('Session changed.'); this.name = 'SessionChangedError' }
}

export function statusOf(error: unknown) {
  const value = error as { status?: number; statusCode?: number; response?: { status?: number } } | null
  return value?.response?.status ?? value?.statusCode ?? value?.status
}

export function createWebSession(state: WebAuthState, actions: {
  me: () => Promise<{ user: WebUser }>
  googleToken: () => Promise<string>
  create: (token: string) => Promise<unknown>
  remove: () => Promise<unknown>
  reset: () => void
  expired: () => void
}) {
  let generation = 0
  let controller = new AbortController()
  let restoring: Promise<void> | null = null

  function invalidate() {
    generation++
    controller.abort()
    controller = new AbortController()
    state.user = null
    state.ready = true
    actions.reset()
  }

  async function restore(force = false) {
    if (state.busy || state.logoutUnconfirmed || (state.ready && !force)) return
    if (restoring) return restoring
    const version = generation
    restoring = (async () => {
      try {
        const { user } = await actions.me()
        if (version !== generation) return
        if (state.user?.uid !== user.uid) invalidate()
        state.user = user
        state.error = ''
      } catch (error) {
        if (version !== generation) return
        invalidate()
        state.error = statusOf(error) === 401 ? '' : 'No se pudo verificar la sesión. Reintenta.'
      } finally {
        if (version === generation || state.user === null) state.ready = true
        restoring = null
      }
    })()
    return restoring
  }

  async function signIn() {
    if (state.busy || state.logoutUnconfirmed) return false
    invalidate()
    state.busy = true
    state.error = ''
    const version = generation
    try {
      const token = await actions.googleToken()
      if (version !== generation) throw new SessionChangedError()
      await actions.create(token)
      const { user } = await actions.me()
      if (version !== generation) throw new SessionChangedError()
      state.user = user
      return true
    } catch (error) {
      if (version === generation) {
        const code = (error as { code?: string })?.code
        state.error = code === 'auth/popup-closed-by-user' ? 'Se canceló el inicio de sesión.'
          : code === 'auth/popup-blocked' ? 'Permite las ventanas emergentes para iniciar sesión.'
          : 'No se pudo iniciar sesión. Revisa la configuración y reintenta.'
      }
      return false
    } finally {
      state.busy = false
    }
  }

  async function logout() {
    if (state.busy) return false
    invalidate()
    state.busy = true
    state.error = ''
    state.logoutUnconfirmed = true
    try {
      await actions.remove()
      state.logoutUnconfirmed = false
      return true
    } catch (error) {
      if (statusOf(error) === 401) { state.logoutUnconfirmed = false; return true }
      state.error = 'No se pudo confirmar el cierre de sesión. Reintenta antes de volver a ingresar.'
      return false
    } finally {
      state.busy = false
    }
  }

  async function request<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (!state.ready) await restore()
    if (!state.user || state.busy || state.logoutUnconfirmed) throw new SessionChangedError()
    const version = generation
    try {
      const result = await operation(controller.signal)
      if (version !== generation) throw new SessionChangedError()
      return result
    } catch (error) {
      if (version !== generation) throw new SessionChangedError()
      if (statusOf(error) === 401) { invalidate(); actions.expired() }
      throw error
    }
  }

  return { restore, signIn, logout, invalidate, request, version: () => generation }
}
