import { createError, eventHandler } from 'h3'
import { requireAuthOrigin, requireUser } from '../utils/auth'

export function createLegacyGate(user: typeof requireUser, origin: typeof requireAuthOrigin) {
  return eventHandler(async event => {
    let path: string
    try {
      path = new URL(decodeURIComponent(event.path.split('?')[0] ?? '').replace(/\/+/g, '/'), 'http://localhost').pathname.toLowerCase().replace(/\/$/, '')
    } catch { throw createError({ statusCode: 400, statusMessage: 'Invalid request path.' }) }
    if (!path.startsWith('/api')) return
    if (path === '/api/auth/me' || path === '/api/auth/session') return
    if (path === '/api/mobile/merchant-search' && event.method === 'POST') return
    if (/^\/api\/_nuxt_icon\/[a-z0-9_-]+(?:\.json)?$/.test(path) && ['GET', 'HEAD'].includes(event.method)) return
    await user(event)
    if (!['GET', 'HEAD'].includes(event.method)) origin(event)
    if ((path === '/api/chat' || path === '/api/upload') && event.method === 'POST') return
    if (/^\/api\/documents\/[a-z0-9_-]{1,128}$/.test(path) && event.method === 'DELETE') return
    if (/^\/api\/(dashboard|resumen|tasks|rocks|sprints|cuotas)$/.test(path) && ['GET', 'HEAD'].includes(event.method)) return
    if ((path === '/api/movimientos' || path === '/api/cuotas') && event.method === 'POST') return
    if (/^\/api\/(tasks|cuotas)\/[a-z0-9_-]{1,128}$/.test(path) && ['PATCH', 'DELETE'].includes(event.method)) return
    if (/^\/api\/sprints\/[a-z0-9_-]{1,128}$/.test(path) && event.method === 'PATCH') return
    throw createError({ statusCode: 503, statusMessage: 'This feature is temporarily unavailable during the secure Firestore migration.' })
  })
}

export default createLegacyGate(requireUser, requireAuthOrigin)
