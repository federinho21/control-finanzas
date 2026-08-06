import { and, desc, eq } from 'drizzle-orm'
import { customAlphabet } from 'nanoid'
import type { ProposedPlan } from '~~/shared/types/plan'
import type { ProposedTask, Task } from '~~/shared/types/task'
import type { Cuota } from '~~/shared/types/cuota'
import { db, rawDb } from '~~/server/db'
import { cuotas, rocks, sprints, tasks } from '~~/server/db/schema'
import type { MovementType } from '~~/server/db/schema'
import { normalizeDateToDb } from '~~/shared/utils/date'
import { validateCreateTask, validateDeleteRock } from './guardrails'

const alphaNum = customAlphabet('1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ', 4)

function nowIso() {
  return new Date().toISOString()
}

function todayDbDate() {
  // Persisted date fields are stored as YYYY-MM-DD in DB.
  return normalizeDateToDb(new Date().toISOString().slice(0, 10))
}

function toAmount(value: unknown): string {
  const raw = String(value ?? '0').replace(',', '.')
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return '0'
  }
  return parsed.toFixed(2)
}

export async function createRock(input: {
  name: string
  description: string
  deadline: string
}) {
  // Enforce DB date storage format regardless of caller input shape.
  const deadline = normalizeDateToDb(input.deadline)
  // Reject rock deadlines in the past to keep persisted plans actionable.
  if (deadline < todayDbDate()) {
    throw new Error('Rock deadline cannot be in the past.')
  }

  const id = `R-${alphaNum()}`
  await db.insert(rocks).values({
    id,
    name: input.name,
    description: input.description,
    deadline,
    status: 'active',
    createdAt: nowIso()
  })

  return { id }
}

export async function createSprint(input: {
  rockId: string
  name: string
  startDate: string
  endDate: string
}) {
  const startDate = normalizeDateToDb(input.startDate)
  const endDate = normalizeDateToDb(input.endDate)
  const today = todayDbDate()

  // Keep sprint windows current and chronologically valid.
  if (startDate < today) {
    throw new Error('Sprint startDate cannot be in the past.')
  }
  if (endDate < today) {
    throw new Error('Sprint endDate cannot be in the past.')
  }
  if (endDate < startDate) {
    throw new Error('Sprint endDate must be on or after startDate.')
  }

  const rock = await db.query.rocks.findFirst({ where: eq(rocks.id, input.rockId) })
  if (!rock) {
    throw new Error(`Rock ${input.rockId} does not exist`)
  }

  const id = `S-${alphaNum()}`
  await db.insert(sprints).values({
    id,
    name: input.name,
    startDate,
    endDate,
    rockId: input.rockId,
    status: 'planned',
    createdAt: nowIso()
  })

  return { id }
}

export async function createTask(input: {
  rockId: string
  sprintId: string
  description: string
  owner: string
  deadline: string
  priority: 'high' | 'medium' | 'low'
  monto?: string
  tipo?: MovementType
}) {
  const deadline = normalizeDateToDb(input.deadline)
  // Movements may reference past dates (historical expenses), so no past-date rejection here.
  const validation = await validateCreateTask({
    rockId: input.rockId,
    sprintId: input.sprintId,
    deadline
  })

  if (!validation.valid) {
    throw new Error(validation.reason)
  }

  const id = `T-${alphaNum()}`
  await db.insert(tasks).values({
    id,
    description: input.description,
    owner: input.owner,
    deadline,
    priority: input.priority,
    status: 'pending',
    rockId: input.rockId,
    sprintId: input.sprintId,
    monto: toAmount(input.monto),
    tipo: input.tipo ?? 'gasto',
    createdAt: nowIso()
  })

  return { id }
}

export async function batchCreateTasks(input: {
  rockId: string
  sprintId: string
  tasks: ProposedTask[]
}) {
  const created: string[] = []

  for (const item of input.tasks) {
    if (item.selected === false) {
      continue
    }

    const result = await createTask({
      rockId: input.rockId,
      sprintId: input.sprintId,
      description: item.description,
      owner: item.owner,
      deadline: item.deadline,
      priority: item.priority,
      monto: item.monto,
      tipo: item.tipo
    })

    created.push(result.id)
  }

  return { created }
}

// Persists a full proposed plan atomically and enforces date/sprint boundary rules.
export async function savePlan(input: { plan: ProposedPlan }) {
  // Persist rock, sprints, and tasks atomically so partial plans are never stored.
  const runSavePlan = rawDb.transaction((plan: ProposedPlan) => {
    const createdSprintIds: string[] = []
    const createdTaskIds: string[] = []
    const today = todayDbDate()

    const rockId = `R-${alphaNum()}`
    const rockDeadline = normalizeDateToDb(plan.rock.deadline)
    // Apply the same date constraints used by single-create APIs.
    if (rockDeadline < today) {
      throw new Error('Rock deadline cannot be in the past.')
    }

    rawDb
      .prepare(
        `
        INSERT INTO rocks (id, name, description, deadline, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        `
      )
      .run(rockId, plan.rock.name, plan.rock.description, rockDeadline, 'active', nowIso())

    for (const sprint of plan.sprints) {
      const sprintId = `S-${alphaNum()}`
      const sprintStartDate = normalizeDateToDb(sprint.startDate)
      const sprintEndDate = normalizeDateToDb(sprint.endDate)

      if (sprintStartDate < today) {
        throw new Error('Sprint startDate cannot be in the past.')
      }
      if (sprintEndDate < today) {
        throw new Error('Sprint endDate cannot be in the past.')
      }
      if (sprintEndDate < sprintStartDate) {
        throw new Error('Sprint endDate must be on or after startDate.')
      }

      rawDb
        .prepare(
          `
          INSERT INTO sprints (id, name, start_date, end_date, rock_id, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(sprintId, sprint.name, sprintStartDate, sprintEndDate, rockId, 'planned', nowIso())

      createdSprintIds.push(sprintId)

      for (const task of sprint.tasks) {
        if (task.selected === false) {
          continue
        }

        const taskDeadline = normalizeDateToDb(task.deadline)
        if (taskDeadline < today) {
          throw new Error('Task deadline cannot be in the past.')
        }
        if (taskDeadline < sprintStartDate || taskDeadline > sprintEndDate) {
          throw new Error(
            `Sprint Boundary Rule: deadline ${taskDeadline} must be between ${sprintStartDate} and ${sprintEndDate}.`
          )
        }

        const taskId = `T-${alphaNum()}`
        rawDb
          .prepare(
            `
            INSERT INTO tasks (id, description, owner, deadline, priority, status, rock_id, sprint_id, monto, tipo, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `
          )
          .run(taskId, task.description, task.owner, taskDeadline, task.priority, 'pending', rockId, sprintId, toAmount(task.monto), task.tipo ?? 'gasto', nowIso())

        createdTaskIds.push(taskId)
      }
    }

    return {
      rockId,
      sprintIds: createdSprintIds,
      taskIds: createdTaskIds
    }
  })

  return runSavePlan(input.plan)
}

export async function deleteRock(input: { rockId: string; force?: boolean }) {
  const validation = await validateDeleteRock(input)

  if (!validation.valid) {
    return {
      deleted: false,
      needsConfirmation: validation.needsConfirmation ?? false,
      reason: validation.reason,
      metadata: validation.metadata
    }
  }

  await db.delete(tasks).where(eq(tasks.rockId, input.rockId))
  await db.delete(sprints).where(eq(sprints.rockId, input.rockId))
  await db.delete(rocks).where(eq(rocks.id, input.rockId))

  return { deleted: true, needsConfirmation: false }
}

export async function listBacklog() {
  const rockRows = await db.select().from(rocks).orderBy(desc(rocks.createdAt))
  const sprintRows = await db.select().from(sprints).orderBy(desc(sprints.createdAt))
  const taskRows = await db.select().from(tasks).orderBy(desc(tasks.createdAt))

  return {
    rocks: rockRows,
    sprints: sprintRows,
    tasks: taskRows
  }
}

export async function listTasksByRockAndSprint(rockId: string, sprintId: string): Promise<Task[]> {
  return db
    .select()
    .from(tasks)
    .where(and(eq(tasks.rockId, rockId), eq(tasks.sprintId, sprintId))) as Promise<Task[]>
}

// Updates the status of an existing sprint. Throws if the sprint ID does not exist.
export async function updateSprintStatus(input: {
  sprintId: string
  status: 'planned' | 'in_progress' | 'completed' | 'on_hold'
}) {
  const updated = await db
    .update(sprints)
    .set({ status: input.status })
    .where(eq(sprints.id, input.sprintId))
    .returning()

  if (!updated.length) {
    throw new Error(`Sprint ${input.sprintId} not found.`)
  }

  return updated[0]
}

// Updates the status of an existing task. Throws if the task ID does not exist.
export async function updateTaskStatus(input: {
  taskId: string
  status: 'pending' | 'in_progress' | 'completed'
}) {
  const updated = await db
    .update(tasks)
    .set({ status: input.status })
    .where(eq(tasks.id, input.taskId))
    .returning()

  if (!updated.length) {
    throw new Error(`Task ${input.taskId} not found.`)
  }

  return updated[0]
}

// Queries a rock by ID and returns related sprints/tasks with completion metrics.
export async function queryRock(rockId: string) {
  const rock = await db.query.rocks.findFirst({ where: eq(rocks.id, rockId) })
  if (!rock) {
    return null
  }

  const rockSprints = await db.query.sprints.findMany({ where: eq(sprints.rockId, rockId) })
  const rockTasks = await db.query.tasks.findMany({ where: eq(tasks.rockId, rockId) })

  const completedTasks = rockTasks.filter(t => t.status === 'completed').length
  const totalTasks = rockTasks.length
  const completionPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  return {
    ...rock,
    sprints: rockSprints,
    tasks: rockTasks,
    completedTasks,
    totalTasks,
    completionPercent
  }
}

// Queries a sprint by ID and returns all tasks plus a status summary.
export async function querySprint(sprintId: string) {
  const sprint = await db.query.sprints.findFirst({ where: eq(sprints.id, sprintId) })
  if (!sprint) {
    return null
  }

  const sprintTasks = await db.query.tasks.findMany({ where: eq(tasks.sprintId, sprintId) })

  const completed = sprintTasks.filter(t => t.status === 'completed').length
  const inProgress = sprintTasks.filter(t => t.status === 'in_progress').length
  const onHold = sprintTasks.filter(t => t.status === 'on_hold').length
  const pending = sprintTasks.filter(t => t.status === 'pending').length

  return {
    ...sprint,
    tasks: sprintTasks,
    summary: { completed, in_progress: inProgress, on_hold: onHold, pending, total: sprintTasks.length }
  }
}

// Queries a task by ID and enriches it with lightweight rock/sprint references.
export async function queryTask(taskId: string) {
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) })
  if (!task) {
    return null
  }

  const rock = task.rockId ? await db.query.rocks.findFirst({ where: eq(rocks.id, task.rockId) }) : null
  const sprint = task.sprintId ? await db.query.sprints.findFirst({ where: eq(sprints.id, task.sprintId) }) : null

  return {
    ...task,
    rock: rock ? { id: rock.id, name: rock.name, status: rock.status } : null,
    sprint: sprint ? { id: sprint.id, name: sprint.name, status: sprint.status } : null
  }
}

// --- Cuotas fijas ---

export async function createCuota(input: {
  nombre: string
  frecuencia: 'mensual' | 'anual'
  monto: string
  categoria: string
}) {
  const id = `U-${alphaNum()}`
  await db.insert(cuotas).values({
    id,
    nombre: input.nombre,
    frecuencia: input.frecuencia,
    monto: toAmount(input.monto),
    categoria: input.categoria,
    ultimoPago: null,
    status: 'active',
    createdAt: nowIso()
  })

  return { id }
}

export async function listCuotas(): Promise<Cuota[]> {
  return db.select().from(cuotas).orderBy(desc(cuotas.createdAt)) as Promise<Cuota[]>
}

export async function deleteCuota(cuotaId: string) {
  const deleted = await db.delete(cuotas).where(eq(cuotas.id, cuotaId)).returning()
  return { deleted: deleted.length > 0 }
}

// Marks a cuota as paid for the current period and registers it as a gasto movement.
// If a sprint (period) matching the payment month does not exist, it is created and
// linked to the default rock, keeping the strategic anchor guardrail satisfied.
export async function markCuotaPagada(input: {
  cuotaId: string
  rockId?: string
}) {
  const cuota = await db.query.cuotas.findFirst({ where: eq(cuotas.id, input.cuotaId) })
  if (!cuota) {
    throw new Error(`Cuota ${input.cuotaId} not found.`)
  }

  const today = new Date()
  const todayDb = todayDbDate()
  const monthKey = todayDb.slice(0, 7)
  const yearKey = todayDb.slice(0, 4)

  // Payment window depends on frequency: full month for mensual, whole year for anual.
  const startDate = cuota.frecuencia === 'mensual' ? `${monthKey}-01` : `${yearKey}-01-01`
  const endDate = cuota.frecuencia === 'mensual' ? `${monthKey}-31` : `${yearKey}-12-31`

  const existingSprint = await db.query.sprints.findFirst({ where: eq(sprints.startDate, startDate) })

  // Resolve the rock that anchors movements: explicit rock, existing period's rock, or a default account.
  let rockId = input.rockId ?? existingSprint?.rockId
  if (!rockId) {
    const fallbackRock = await createRock({
      name: 'Gastos recurrentes',
      description: 'Cuenta para cuotas fijas y suscripciones recurrentes.',
      deadline: `${Number(today.getFullYear()) + 1}-12-31`
    })
    rockId = fallbackRock.id
  }

  const sprintId = existingSprint?.id ?? `S-${alphaNum()}`
  if (!existingSprint) {
    await db.insert(sprints).values({
      id: sprintId,
      name: cuota.frecuencia === 'mensual' ? `Período ${monthKey}` : `Período ${yearKey}`,
      startDate,
      endDate,
      rockId,
      status: 'in_progress',
      createdAt: nowIso()
    })
  }

  // Register the payment as a gasto movement inside the period window.
  const description = `${cuota.nombre} (cuota ${cuota.frecuencia})`
  const existingMovement = await db.query.tasks.findFirst({
    where: and(eq(tasks.description, description), eq(tasks.sprintId, sprintId))
  })

  if (!existingMovement) {
    await createTask({
      rockId,
      sprintId,
      description,
      owner: cuota.categoria,
      deadline: todayDb,
      priority: 'medium',
      monto: cuota.monto,
      tipo: 'gasto'
    })
  }

  // Update last payment timestamp and consume the payment state.
  const updated = await db
    .update(cuotas)
    .set({ ultimoPago: today.toISOString().slice(0, 10) })
    .where(eq(cuotas.id, cuota.id))
    .returning()

  return updated[0]
}

// Returns aggregated monthly summary from movements within a period window.
export async function monthlySummary(monthKey: string) {
  const movements = await db.select().from(tasks).orderBy(desc(tasks.deadline))

  const matching = movements.filter((m) => m.deadline.slice(0, 7) === monthKey)
  const ingresos = matching.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0)
  const gastos = matching.filter((m) => m.tipo === 'gasto').reduce((s, m) => s + Number(m.monto), 0)
  const retiros = matching.filter((m) => m.tipo === 'retiro').reduce((s, m) => s + Number(m.monto), 0)

  return {
    month: monthKey,
    ingresos,
    gastos,
    retiros,
    balance: ingresos - gastos - retiros,
    movements: matching.map((m) => ({
      id: m.id,
      description: m.description,
      categoria: m.owner,
      deadline: m.deadline,
      monto: m.monto,
      tipo: m.tipo,
      status: m.status
    }))
  }
}
