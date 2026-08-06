import { eventHandler } from 'h3'
import { db } from '~~/server/db'

/**
 * Handles GET /api/dashboard and returns financial KPIs for the current month.
 * @returns Dashboard payload with monthly totals, category breakdown, and global aggregates.
 * @throws Propagates database query errors when source data cannot be loaded.
 */
export default eventHandler(async () => {
  const allTasks = await db.query.tasks.findMany()
  const allCuotas = await db.query.cuotas.findMany()

  const currentMonth = new Date().toISOString().slice(0, 7)
  const monthMovements = allTasks.filter((t) => t.deadline.slice(0, 7) === currentMonth)

  const ingresos = monthMovements.filter((t) => t.tipo === 'ingreso').reduce((s, t) => s + Number(t.monto ?? 0), 0)
  const gastos = monthMovements.filter((t) => t.tipo === 'gasto').reduce((s, t) => s + Number(t.monto ?? 0), 0)
  const retiros = monthMovements.filter((t) => t.tipo === 'retiro').reduce((s, t) => s + Number(t.monto ?? 0), 0)
  const balance = ingresos - gastos - retiros

  // Category breakdown for the current month.
  const byCategory = Object.entries(
    monthMovements.reduce<Record<string, { gastos: number; ingresos: number }>>((acc, m) => {
      const cat = m.owner?.trim() || 'Sin categoría'
      acc[cat] = acc[cat] ?? { gastos: 0, ingresos: 0 }
      if (m.tipo === 'gasto' || m.tipo === 'retiro') acc[cat].gastos += Number(m.monto ?? 0)
      if (m.tipo === 'ingreso') acc[cat].ingresos += Number(m.monto ?? 0)
      return acc
    }, {})
  )
    .map(([category, values]) => ({ category, ...values }))
    .sort((a, b) => b.gastos - a.gastos)

  // Global movement type totals across all months.
  const totals = {
    ingresos: allTasks.filter((t) => t.tipo === 'ingreso').reduce((s, t) => s + Number(t.monto ?? 0), 0),
    gastos: allTasks.filter((t) => t.tipo === 'gasto').reduce((s, t) => s + Number(t.monto ?? 0), 0),
    retiros: allTasks.filter((t) => t.tipo === 'retiro').reduce((s, t) => s + Number(t.monto ?? 0), 0)
  }

  const cuotasActivas = allCuotas.filter((c) => c.status === 'active').length
  const cuotasPendientes = allCuotas.filter((c) => c.status === 'active' && !c.ultimoPago).length

  return {
    month: currentMonth,
    ingresos,
    gastos,
    retiros,
    balance,
    movementsCount: monthMovements.length,
    byCategory,
    totals,
    cuotas: {
      total: allCuotas.length,
      activas: cuotasActivas,
      pendientes: cuotasPendientes
    }
  }
})
