import { createError, eventHandler, getHeader } from 'h3'
import { requireAuthOrigin, requireUser } from '../utils/auth'
import { readLimitedBytes } from '../utils/request-input'
import { getAgentRepository } from '../repositories/agent'
import { getDocumentRepository } from '../repositories/documents'
import { FinanceError } from '../repositories/finance-model'
import { runDocumentUpload } from '../agents/data-agent'

export default eventHandler(async event => {
  const user = await requireUser(event)
  requireAuthOrigin(event)
  try {
    const contentType = getHeader(event, 'content-type') ?? ''
    if (!contentType.startsWith('multipart/form-data;')) throw new FinanceError(415, 'Multipart form data required.')
    await getAgentRepository().quota(user.uid, 'upload', 5, 3600000)
    const bytes = await readLimitedBytes(event, 6 * 1024 * 1024)
    const request = new Request('http://localhost', { method: 'POST', headers: { 'content-type': contentType }, body: new Uint8Array(bytes) })
    const form = await request.formData()
    const entries = [...form.entries()]
    if (entries.length !== 1 || entries[0]?.[0] !== 'file') throw new FinanceError(400, 'Upload exactly one file.')
    const file = form.get('file')
    if (!file || typeof file === 'string') throw new FinanceError(400, 'File required.')
    return await runDocumentUpload(user.uid, { filename: file.name, mime: file.type, bytes: Buffer.from(await file.arrayBuffer()) }, getDocumentRepository())
  } catch (error) {
    if (error instanceof FinanceError) throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    throw createError({ statusCode: 503, statusMessage: 'Document processing unavailable. Retry later.' })
  }
})
