import { createError, getHeader, setHeader, setResponseStatus, type H3Event } from 'h3'
import { readLimitedBytes } from './request-input'
import { merchantSearchInput, type MerchantSearchResult } from './merchant-search'

export function createMerchantSearchHandler(options: {
  verify: (token: string) => Promise<{ uid: string }>;
  search: (uid: string, query: string) => Promise<MerchantSearchResult>
}) {
  return async (event: H3Event) => {
    setHeader(event, 'Cache-Control', 'no-store')
    setHeader(event, 'Vary', 'Authorization')
    const header = getHeader(event, 'authorization')
    const token = header?.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token || token.length > 16000 || /\s/.test(token)) throw createError({ statusCode: 401, statusMessage: 'Unauthorized.' })
    let uid: string
    try { uid = (await options.verify(token)).uid; if (!uid) throw Error('No owner') }
    catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized.' }) }
    if (!getHeader(event, 'content-type')?.startsWith('application/json')) throw createError({ statusCode: 415, statusMessage: 'JSON required.' })
    let input: unknown
    try { input = JSON.parse((await readLimitedBytes(event, 1024)).toString('utf8')) }
    catch { throw createError({ statusCode: 400, statusMessage: 'Invalid search request.' }) }
    const parsed = merchantSearchInput.safeParse(input)
    if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid search request.' })
    const result = await options.search(uid, parsed.data.query)
    if (result.status === 'limited') {
      setResponseStatus(event, 429)
      setHeader(event, 'Retry-After', result.retryAfterSeconds ?? 60)
    }
    return result
  }
}
