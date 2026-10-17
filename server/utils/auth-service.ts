import { createError, deleteCookie, getCookie, getHeader, setCookie, setHeader, type H3Event } from 'h3'
import { z } from 'zod'
import { readLimitedBytes } from './request-input'

export interface VerifiedIdentity {
  uid: string
  auth_time: number
  email?: string
  name?: string
  firebase?: { sign_in_provider?: string }
}

export interface AuthProvider {
  verifyIdToken(token: string, checkRevoked: boolean): Promise<VerifiedIdentity>
  verifySessionCookie(cookie: string, checkRevoked: boolean): Promise<VerifiedIdentity>
  createSessionCookie(token: string, options: { expiresIn: number }): Promise<string>
  revokeRefreshTokens(uid: string): Promise<void>
}

const lifetime = 5 * 24 * 60 * 60 * 1000
const sessionInput = z.object({ idToken: z.string().min(1).max(16000) }).strict()

export function createAuthService(options: {
  provider: () => Promise<AuthProvider>
  origin: () => string | undefined
  production: boolean
  now?: () => number
}) {
  const now = options.now ?? Date.now
  const cookieName = options.production ? '__Host-finanzas-session' : 'finanzas_session'
  const cookieOptions = { httpOnly: true, secure: options.production, sameSite: 'lax' as const, path: '/' }
  const attempts = new Map<string, { count: number; expires: number }>()
  const verifiedUsers = new WeakMap<H3Event, { uid: string; email?: string; name?: string }>()

  function noStore(event: H3Event) {
    setHeader(event, 'Cache-Control', 'no-store')
    setHeader(event, 'Vary', 'Cookie')
  }

  function requireOrigin(event: H3Event) {
    const expected = options.origin()
    if (!expected) throw createError({ statusCode: 503, statusMessage: 'Authentication is not configured.' })
    if (getHeader(event, 'origin') !== expected || getHeader(event, 'sec-fetch-site') === 'cross-site') {
      throw createError({ statusCode: 403, statusMessage: 'Request origin denied.' })
    }
  }

  function limit(event: H3Event) {
    const time = now()
    for (const [key, entry] of attempts) if (entry.expires <= time) attempts.delete(key)
    const key = event.node.req.socket?.remoteAddress ?? 'unknown'
    let entry = attempts.get(key)
    if (!entry) {
      if (attempts.size >= 10000) throw createError({ statusCode: 429, statusMessage: 'Too many requests.' })
      entry = { count: 0, expires: time + 60000 }
      attempts.set(key, entry)
    }
    if (++entry.count > 10) {
      setHeader(event, 'Retry-After', Math.ceil((entry.expires - time) / 1000))
      throw createError({ statusCode: 429, statusMessage: 'Too many requests.' })
    }
  }

  async function provider() {
    try { return await options.provider() } catch {
      throw createError({ statusCode: 503, statusMessage: 'Authentication is unavailable.' })
    }
  }

  async function requireUser(event: H3Event) {
    noStore(event)
    const cached = verifiedUsers.get(event)
    if (cached) return cached
    const token = getCookie(event, cookieName)
    if (!token || token.length > 16000) throw createError({ statusCode: 401, statusMessage: 'Unauthorized.' })
    const auth = await provider()
    let identity: VerifiedIdentity
    try { identity = await auth.verifySessionCookie(token, true) } catch {
      deleteCookie(event, cookieName, cookieOptions)
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized.' })
    }
    if (!identity.uid || identity.firebase?.sign_in_provider !== 'google.com') {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized.' })
    }
    const user = Object.freeze({ uid: identity.uid, email: identity.email, name: identity.name })
    verifiedUsers.set(event, user)
    return user
  }

  async function createSession(event: H3Event) {
    noStore(event)
    requireOrigin(event)
    limit(event)
    if (!getHeader(event, 'content-type')?.startsWith('application/json')) {
      throw createError({ statusCode: 415, statusMessage: 'JSON required.' })
    }
    const bytes = await readLimitedBytes(event, 20000)
    let body: unknown
    try { body = JSON.parse(bytes.toString('utf8')) } catch {
      throw createError({ statusCode: 400, statusMessage: 'Invalid session request.' })
    }
    const input = sessionInput.safeParse(body)
    if (!input.success) throw createError({ statusCode: 400, statusMessage: 'Invalid session request.' })
    const auth = await provider()
    let identity: VerifiedIdentity
    let cookie: string
    try {
      identity = await auth.verifyIdToken(input.data.idToken, true)
      const age = Math.floor(now() / 1000) - identity.auth_time
      if (!identity.uid || !Number.isFinite(age) || age < -60 || age > 300 || identity.firebase?.sign_in_provider !== 'google.com') {
        throw new Error('Invalid sign-in')
      }
      cookie = await auth.createSessionCookie(input.data.idToken, { expiresIn: lifetime })
    } catch {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized.' })
    }
    setCookie(event, cookieName, cookie, { ...cookieOptions, maxAge: lifetime / 1000 })
    return { user: { uid: identity.uid, email: identity.email, name: identity.name } }
  }

  async function deleteSession(event: H3Event) {
    noStore(event)
    requireOrigin(event)
    limit(event)
    try {
      const user = await requireUser(event)
      const auth = await provider()
      try { await auth.revokeRefreshTokens(user.uid) } catch {
        throw createError({ statusCode: 503, statusMessage: 'Session revocation is unavailable.' })
      }
      return { ok: true }
    } finally {
      deleteCookie(event, cookieName, cookieOptions)
    }
  }

  return { requireUser, requireOrigin, createSession, deleteSession }
}
