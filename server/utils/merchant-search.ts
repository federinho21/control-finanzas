import { domainToASCII } from 'node:url'
import { z } from 'zod'

export const merchantSearchInput = z.object({ query: z.string().trim().min(3).max(120).refine(value => !/[\x00-\x1f\x7f]/.test(value)) }).strict()
export type MerchantSearchResult = { status: 'ok' | 'disabled' | 'limited' | 'unavailable'; merchants: Array<{ name: string; domain: string }>; retryAfterSeconds?: number }

function domain(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 253) return null
  const host = domainToASCII(value.toLowerCase())
  if (!host.includes('.') || /^[\d.]+$/.test(host) || /\.(local|localhost|internal)$/.test(host)) return null
  return host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ? host : null
}

async function limitedJson(response: Response) {
  if (!response.headers.get('content-type')?.includes('application/json') || !response.body) throw Error('Invalid provider response')
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.length
      if (length > 65536) throw Error('Provider response too large')
      chunks.push(value)
    }
  } finally { await reader.cancel() }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

export function createMerchantSearch(options: {
  secret: () => string | undefined; reserve: (uid: string) => Promise<void>; block: (seconds: number) => Promise<void>;
  fetch: typeof globalThis.fetch; now?: () => number
}) {
  const now = options.now ?? Date.now
  const cache = new Map<string, { expires: number; value: MerchantSearchResult }>()
  let blockedUntil = 0
  async function search(uid: string, query: string): Promise<MerchantSearchResult> {
    const { query: name } = merchantSearchInput.parse({ query })
    const secret = options.secret()?.trim()
    if (!secret || !/^sk_[A-Za-z0-9_-]+$/.test(secret)) return { status: 'disabled', merchants: [] }
    const key = JSON.stringify([uid, name.toLocaleLowerCase('en')])
    const previous = cache.get(key)
    if (previous && previous.expires > now()) return previous.value
    if (blockedUntil > now()) return { status: 'limited', merchants: [], retryAfterSeconds: Math.ceil((blockedUntil - now()) / 1000) }
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 4000)
    try {
      await options.reserve(uid)
      const url = new URL('https://api.logo.dev/v2/search')
      url.search = new URLSearchParams({ q: name, method: 'typeahead', limit: '5' }).toString()
      const response = await options.fetch(url, { headers: { Authorization: `Bearer ${secret}` }, signal: controller.signal, redirect: 'error' })
      if (response.status === 429) {
        const seconds = Math.min(3600, Math.max(1, Number(response.headers.get('RateLimit-Reset') ?? response.headers.get('Retry-After')) || 60))
        blockedUntil = now() + seconds * 1000
        await options.block(seconds)
        return { status: 'limited', merchants: [], retryAfterSeconds: seconds }
      }
      if (response.status === 401 || response.status === 402) {
        blockedUntil = now() + 300000
        await options.block(300)
      }
      if (!response.ok) return { status: 'unavailable', merchants: [] }
      const body = await limitedJson(response)
      if (!body || typeof body !== 'object' || !('data' in body) || !Array.isArray(body.data)) throw Error('Invalid provider response')
      const merchants: MerchantSearchResult['merchants'] = []
      for (const row of body.data.slice(0, 25)) {
        if (!row || typeof row !== 'object' || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 120) continue
        const host = domain(row.domain)
        if (host && !merchants.some(value => value.domain === host)) merchants.push({ name: row.name.trim(), domain: host })
        if (merchants.length === 5) break
      }
      const value: MerchantSearchResult = { status: 'ok', merchants }
      if (cache.size >= 256) cache.delete(cache.keys().next().value!)
      cache.set(key, { expires: now() + 15 * 60000, value })
      return value
    } catch (error) {
      return (error as { statusCode?: number }).statusCode === 429
        ? { status: 'limited', merchants: [], retryAfterSeconds: 60 } : { status: 'unavailable', merchants: [] }
    } finally { clearTimeout(timer) }
  }
  return { search }
}
