import { createAuthService } from './auth-service'

const service = createAuthService({
  production: process.env.NODE_ENV === 'production',
  origin: () => process.env.AUTH_ORIGIN,
  provider: async () => {
    const { getFirebaseAuth } = await import('../firebase/admin')
    return getFirebaseAuth()
  }
})

export const requireUser = service.requireUser
export const requireAuthOrigin = service.requireOrigin
export const createAuthSession = service.createSession
export const deleteAuthSession = service.deleteSession
