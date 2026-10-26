import { createError, getHeader, getQuery, getRouterParam, setHeader, type H3Event } from 'h3'
import { z } from 'zod'
import { getFinanceRepository, type FinanceCommand, type FinanceRepository } from '../repositories/finance'
import { cuotaInput, cuotaPaymentInput, FinanceError, monthInput, movementInput, recordId, statusInput } from '../repositories/finance-model'
import { requireAuthOrigin, requireUser } from './auth'
import { readLimitedBytes } from './request-input'

async function jsonInput<T extends z.ZodType>(event: H3Event, schema: T): Promise<z.output<T>> {
  if (!getHeader(event, 'content-type')?.startsWith('application/json')) throw createError({ statusCode: 415, statusMessage: 'JSON required.' })
  const bytes = await readLimitedBytes(event, 20000)
  let body: unknown
  try { body = JSON.parse(bytes.toString('utf8')) } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request.' })
  }
  return schema.parse(body)
}

export function createFinanceHandlers(dependencies: {
  user: (event: H3Event) => Promise<{ uid: string }>
  origin: (event: H3Event) => void
  repository: () => FinanceRepository
  write: (uid: string, command: FinanceCommand, repository: FinanceRepository) => Promise<unknown>
}) {
  const attempts = new Map<string, { count: number; expires: number }>()
  const wrap = (operation: (event: H3Event, uid: string, repository: FinanceRepository) => Promise<unknown>) => async (event: H3Event) => {
    setHeader(event, 'Cache-Control', 'no-store')
    setHeader(event, 'Vary', 'Cookie')
    const user = await dependencies.user(event)
    if (!['GET', 'HEAD'].includes(event.method)) dependencies.origin(event)
    const now = Date.now()
    for (const [key, entry] of attempts) if (entry.expires <= now) attempts.delete(key)
    let entry = attempts.get(user.uid)
    if (!entry) {
      if (attempts.size >= 10000) throw createError({ statusCode: 429, statusMessage: 'Too many requests.' })
      entry = { count: 0, expires: now + 60000 }
      attempts.set(user.uid, entry)
    }
    if (++entry.count > 120) {
      setHeader(event, 'Retry-After', Math.ceil((entry.expires - now) / 1000))
      throw createError({ statusCode: 429, statusMessage: 'Too many requests.' })
    }
    try { return await operation(event, user.uid, dependencies.repository()) } catch (error) {
      if (error instanceof FinanceError) throw createError({ statusCode: error.statusCode, statusMessage: error.message })
      if (error instanceof z.ZodError) throw createError({ statusCode: 400, statusMessage: 'Invalid request.' })
      if (error && typeof error === 'object' && 'statusCode' in error) throw error
      if (error && typeof error === 'object' && 'code' in error && error.code === 6) throw createError({ statusCode: 409, statusMessage: 'Generated ID collision. Retry the request.' })
      throw createError({ statusCode: 503, statusMessage: 'Financial service is unavailable.' })
    }
  }
  const id = (event: H3Event) => recordId.parse(getRouterParam(event, 'id'))
  const requestId = (event: H3Event) => z.string().uuid().optional().parse(getHeader(event, 'idempotency-key'))
  return {
    rocks: wrap((_event, uid, repo) => repo.listRocks(uid)),
    sprints: wrap((_event, uid, repo) => repo.listSprints(uid)),
    cuotas: wrap((_event, uid, repo) => repo.listCuotas(uid)),
    tasks: wrap(async (event, uid, repo) => {
      const query = z.object({ mes: monthInput.optional() }).strict().parse(getQuery(event))
      return (await repo.loadMovements(uid, query.mes)).items
    }),
    resumen: wrap((event, uid, repo) => {
      const query = z.object({ mes: monthInput }).strict().parse(getQuery(event))
      return repo.monthlySummary(uid, query.mes)
    }),
    dashboard: wrap((_event, uid, repo) => repo.dashboard(uid)),
    createMovement: wrap(async (event, uid, repo) => dependencies.write(uid, { type: 'create_movement', input: await jsonInput(event, movementInput), requestId: requestId(event) }, repo)),
    createCuota: wrap(async (event, uid, repo) => dependencies.write(uid, { type: 'create_cuota', input: await jsonInput(event, cuotaInput), requestId: requestId(event) }, repo)),
    payCuota: wrap(async (event, uid, repo) => {
      const cuotaId = id(event)
      const input = await jsonInput(event, cuotaPaymentInput)
      return dependencies.write(uid, { type: 'pay_cuota', id: cuotaId, rockId: input.rockId }, repo)
    }),
    deleteCuota: wrap((event, uid, repo) => dependencies.write(uid, { type: 'delete_cuota', id: id(event) }, repo)),
    updateTask: wrap(async (event, uid, repo) => {
      const taskId = id(event)
      const input = await jsonInput(event, statusInput)
      return dependencies.write(uid, { type: 'update_movement', id: taskId, status: input.status }, repo)
    }),
    deleteTask: wrap((event, uid, repo) => dependencies.write(uid, { type: 'delete_movement', id: id(event) }, repo)),
    updateSprint: wrap(async () => { throw new FinanceError(405, 'Sprint status is derived automatically.') })
  }
}

export const financeHandlers = createFinanceHandlers({
  user: requireUser, origin: requireAuthOrigin, repository: getFinanceRepository,
  write: async (uid, command, repository) => {
    const { runFinanceOperation } = await import('../agents/data-agent')
    return runFinanceOperation(uid, command, repository)
  }
})
