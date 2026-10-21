import { createError, getHeader, getRequestWebStream, type H3Event } from 'h3'
import { IncomingMessage } from 'node:http'

export async function readLimitedBytes(event: H3Event, maximum: number) {
  const length = Number(getHeader(event, 'content-length') ?? 0)
  if (!Number.isFinite(length) || length < 0 || length > maximum) throw createError({ statusCode: 413, statusMessage: 'Request too large.' })
  const chunks: Buffer[] = []
  let size = 0
  const source = event.node.req instanceof IncomingMessage ? event.node.req : getRequestWebStream(event)
  if (source) for await (const chunk of source as AsyncIterable<Uint8Array | string>) {
    const buffer = Buffer.from(chunk)
    size += buffer.length
    if (size > maximum) throw createError({ statusCode: 413, statusMessage: 'Request too large.' })
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}
export async function readLimitedJson(event: H3Event, maximum = 200000) {
  if (!getHeader(event, 'content-type')?.startsWith('application/json')) throw createError({ statusCode: 415, statusMessage: 'JSON required.' })
  const bytes = await readLimitedBytes(event, maximum)
  try { return JSON.parse(bytes.toString('utf8')) as unknown } catch { throw createError({ statusCode: 400, statusMessage: 'Invalid JSON.' }) }
}
