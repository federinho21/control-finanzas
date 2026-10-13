import { createError, eventHandler, getRouterParam } from 'h3'
import { requireAuthOrigin, requireUser } from '../../utils/auth'
import { getDocumentRepository } from '../../repositories/documents'
import { FinanceError, recordId } from '../../repositories/finance-model'
import { runDocumentDelete } from '../../agents/data-agent'

export default eventHandler(async event => {
  const user = await requireUser(event)
  requireAuthOrigin(event)
  const id = recordId.safeParse(getRouterParam(event, 'tempId'))
  if (!id.success) throw createError({ statusCode: 400, statusMessage: 'Invalid document ID.' })
  try { return await runDocumentDelete(user.uid, id.data, getDocumentRepository()) } catch (error) {
    throw createError({ statusCode: error instanceof FinanceError ? error.statusCode : 503, statusMessage: error instanceof FinanceError ? error.message : 'Document deletion unavailable.' })
  }
})
