import { createError, eventHandler, readBody } from 'h3'
import { createTask } from '~~/server/agents/tools/sql-tools'
import { db } from '~~/server/db'
import { rocks, sprints } from '~~/server/db/schema'
import { eq } from 'drizzle-orm'
import { customAlphabet } from 'nanoid'
import { normalizeDateToDb } from '~~/shared/utils/date'

const alphaNum = customAlphabet('1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ', 4)

/**
 * Handles POST /api/movimientos to register a movement.
 * Creates the period (sprint) for the movement month if it does not exist yet.
 * @param event Nitro event containing the movement payload.
 * @returns The created movement id.
 * @throws {H3Error} Throws 400 when required fields are missing or invalid.
 */
export default eventHandler(async (event) => {
  const body = await readBody<{
    fecha?: string
    tipo?: string
    descripcion?: string
    categoria?: string
    monto?: string
    rockId?: string
  }>(event)

  const descripcion = body.descripcion?.trim()
  const categoria = body.categoria?.trim()
  const tipo = body.tipo?.trim().toLowerCase()
  const monto = Number(String(body.monto ?? '').replace(',', '.'))

  if (!descripcion) throw createError({ statusCode: 400, message: 'Description is required.' })
  if (!categoria) throw createError({ statusCode: 400, message: 'Category is required.' })
  if (tipo !== 'ingreso' && tipo !== 'gasto' && tipo !== 'retiro') {
    throw createError({ statusCode: 400, message: 'Type must be ingreso, gasto, or retiro.' })
  }
  if (!Number.isFinite(monto) || monto <= 0) {
    throw createError({ statusCode: 400, message: 'Amount must be a positive number.' })
  }

  let fechaDb: string
  try {
    fechaDb = normalizeDateToDb(body.fecha || new Date().toISOString().slice(0, 10))
  } catch {
    throw createError({ statusCode: 400, message: 'Invalid date. Expected YYYY-MM-DD.' })
  }

  // Resolve the account: explicit rockId or default account.
  let rockId = body.rockId
  if (rockId) {
    const rock = await db.query.rocks.findFirst({ where: eq(rocks.id, rockId) })
    if (!rock) throw createError({ statusCode: 400, message: `Account ${rockId} does not exist.` })
  } else {
    const defaultRock = await db.query.rocks.findFirst({ where: eq(rocks.name, 'Movimientos generales') })
    if (defaultRock) {
      rockId = defaultRock.id
    } else {
      const id = `R-${alphaNum()}`
      await db.insert(rocks).values({
        id,
        name: 'Movimientos generales',
        description: 'Cuenta por defecto para movimientos sin cuenta asignada.',
        deadline: `${Number(new Date().getFullYear()) + 1}-12-31`,
        status: 'active',
        createdAt: new Date().toISOString()
      })
      rockId = id
    }
  }

  // Resolve the period (sprint) for the movement month.
  const monthKey = fechaDb.slice(0, 7)
  const [year, month] = monthKey.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  const startDate = `${monthKey}-01`
  const endDate = `${monthKey}-${String(lastDay).padStart(2, '0')}`
  let sprintId: string | undefined
  const existingSprint = await db.query.sprints.findFirst({ where: eq(sprints.startDate, startDate) })
  if (existingSprint) {
    sprintId = existingSprint.id
  } else {
    sprintId = `S-${alphaNum()}`
    await db.insert(sprints).values({
      id: sprintId,
      name: `Período ${monthKey}`,
      startDate,
      endDate,
      rockId,
      status: 'in_progress',
      createdAt: new Date().toISOString()
    })
  }

  const created = await createTask({
    rockId,
    sprintId,
    description: descripcion,
    owner: categoria,
    deadline: fechaDb,
    priority: 'medium',
    monto: String(monto),
    tipo: tipo as 'ingreso' | 'gasto' | 'retiro'
  })

  return { id: created.id }
})
