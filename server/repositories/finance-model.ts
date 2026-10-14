import { z } from 'zod'
import type { Task } from '../../shared/types/task'
import type { Sprint } from '../../shared/types/sprint'
import { costaRicaDate, normalizeDateToDb } from '../../shared/utils/date'
export { costaRicaDate } from '../../shared/utils/date'

export class FinanceError extends Error {
  constructor(public statusCode: number, message: string) { super(message) }
}

export const recordId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)
export const monthInput = z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/)
const label = z.string().trim().min(1).max(200)
export const dateInput = z.string().max(10).transform((value, context) => {
  try {
    const date = normalizeDateToDb(value)
    if (Number(date.slice(0, 4)) < 1000) throw new Error('Unsupported year.')
    return date
  } catch {
    context.addIssue({ code: 'custom', message: 'Invalid date.' })
    return z.NEVER
  }
})

export function amountMinor(value: unknown): number {
  const text = String(value ?? '').trim().replace(',', '.')
  if (!/^\d{1,11}(\.\d{1,2})?$/.test(text)) throw new FinanceError(400, 'Invalid amount.')
  const [whole, fraction = ''] = text.split('.')
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1_000_000_000_000) throw new FinanceError(400, 'Invalid amount.')
  return amount
}

export function amountText(minor: number) { return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}` }
const moneyInput = z.union([z.string().max(16), z.number().finite()]).transform((value, context) => {
  try { return amountMinor(value) } catch {
    context.addIssue({ code: 'custom', message: 'Invalid amount.' })
    return z.NEVER
  }
}).refine(value => value > 0, 'Amount must be positive.')

export const movementInput = z.object({
  fecha: dateInput.optional(), tipo: z.enum(['ingreso', 'gasto', 'retiro']),
  descripcion: label, categoria: label, monto: moneyInput, rockId: recordId.optional()
}).strict()
export const movementDraft = movementInput.omit({ rockId: true }).extend({
  fecha: dateInput.refine(date => date <= costaRicaDate(), 'Los movimientos futuros requieren otra planificación.'),
  currency: z.literal('CRC')
}).transform(({ monto, ...rest }) => ({ ...rest, monto: amountText(monto) }))
export const cuotaInput = z.object({ nombre: label, frecuencia: z.enum(['mensual', 'anual']), monto: moneyInput, categoria: label }).strict()
export const cuotaPaymentInput = z.object({ action: z.literal('marcar_pagada').optional(), rockId: recordId.optional() }).strict()
export const statusInput = z.object({ status: z.enum(['pending', 'in_progress', 'completed', 'on_hold']) }).strict()

export function monthWindow(month: string) {
  const valid = monthInput.parse(month)
  const year = Number(valid.slice(0, 4)), number = Number(valid.slice(5, 7))
  const lastDay = new Date(Date.UTC(year, number, 0)).getUTCDate()
  // shortcut: timestamp ranges use Costa Rica's current UTC-6; use historical offsets for pre-1993 imports.
  return { startDate: `${valid}-01`, endDate: `${valid}-${lastDay}`, startTime: Date.UTC(year, number - 1, 1, 6), endTime: Date.UTC(year, number, 1, 6) }
}

export function deriveSprintStatus(rows: Array<{ status: string }>): Sprint['status'] {
  if (!rows.length || rows.every(row => row.status === 'pending')) return 'planned'
  if (rows.every(row => row.status === 'completed')) return 'completed'
  if (rows.every(row => row.status === 'on_hold')) return 'on_hold'
  return 'in_progress'
}

export function importedPayment(id: string, data: Record<string, unknown>): Task | null {
  if (!recordId.safeParse(id).success || data.parsed !== true || data.currency !== 'CRC') return null
  const timestamp = data.timestamp
  if (typeof timestamp !== 'number' || !Number.isSafeInteger(timestamp) || timestamp <= 0 || timestamp > 253402300799999) return null
  const direction = data.direction
  const tipo = direction === 'incoming' ? 'ingreso'
    : direction === 'outgoing' || direction === 'purchase' || (!direction && data.transactionType !== 'sinpe') ? 'gasto' : null
  if (!tipo) return null
  try {
    const amount = amountMinor(data.amount)
    const text = (value: unknown, fallback: string) => typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : fallback
    return {
      id, description: text(data.merchant ?? data.counterpartyName, 'Movimiento importado'),
      owner: text(data.categoria ?? data.category ?? data.institution, 'Sin categoría'),
      deadline: costaRicaDate(timestamp), priority: 'medium', status: 'completed', rockId: '', sprintId: '',
      monto: amountText(amount), tipo, createdAt: new Date(timestamp).toISOString()
    }
  } catch { return null }
}

export function summarize(rows: Task[]) {
  const totals = { ingresos: 0, gastos: 0, retiros: 0 }
  for (const row of rows) {
    const key = row.tipo === 'ingreso' ? 'ingresos' : row.tipo === 'retiro' ? 'retiros' : 'gastos'
    totals[key] += amountMinor(row.monto)
    if (!Number.isSafeInteger(totals[key])) throw new FinanceError(422, 'Financial total exceeds supported precision.')
  }
  return { ingresos: totals.ingresos / 100, gastos: totals.gastos / 100, retiros: totals.retiros / 100, balance: (totals.ingresos - totals.gastos - totals.retiros) / 100 }
}
