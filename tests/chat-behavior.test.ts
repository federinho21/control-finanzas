import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSafeFallbackIntent } from '../server/agents/supervisor'
import * as dataAgent from '../server/agents/data-agent'
import type { Task } from '../shared/types/task'
import type { Cuota } from '../shared/types/cuota'

const { formatMonthlyReport, resolveReportMonth } = dataAgent
const { formatCategoryReport, formatRecentMovements } = dataAgent
const { formatCuotaReport } = dataAgent

test('classification failures never turn read requests or arbitrary text into budget proposals', () => {
  for (const message of ['Gracias', 'Muéstrame el movimiento T-BBBB.', 'Quiero registrar un gasto por almuerzo, no crear un presupuesto.', 'Quiero generar un presupuesto mensual']) {
    const intent = buildSafeFallbackIntent(message)
    assert.equal(intent.route, 'END')
    assert.equal(intent.operation, undefined)
    assert.equal(intent.needsClarification, true)
    assert.match(intent.clarificationQuestion!, /Fede/)
    assert.ok(!/R-XXXX|S-XXXX|backlog/.test(intent.clarificationQuestion!))
  }
})

test('relative report months use the Costa Rica date and handle previous January correctly', () => {
  assert.equal(resolveReportMonth('¿Cuánto gasté este mes?', '2026-10-13'), '2026-10')
  assert.equal(resolveReportMonth('¿Cuánto recibí el mes pasado?', '2026-10-13'), '2026-09')
  assert.equal(resolveReportMonth('Balance del mes anterior', '2026-01-01'), '2025-12')
  assert.equal(resolveReportMonth('Balance this month', '2026-10-13'), '2026-10')
  assert.equal(resolveReportMonth('Balance last month', '2026-10-13'), '2026-09')
})

test('explicit months take precedence; unknown, invalid or multiple periods require clarification', () => {
  assert.equal(resolveReportMonth('Resumen de 2026-09', '2026-10-13'), '2026-09')
  assert.equal(resolveReportMonth('Este mes compara 2026-09 con 2026-10', '2026-10-13'), undefined)
  assert.equal(resolveReportMonth('Balance de 2026-13', '2026-10-13'), undefined)
  assert.equal(resolveReportMonth('Balance de 2026-10-12', '2026-10-13'), undefined)
  assert.equal(resolveReportMonth('Balance de ayer', '2026-10-13'), undefined)
  assert.equal(resolveReportMonth('Compara este mes con el mes pasado', '2026-10-13'), undefined)
})

const summary = { month: '2026-10', ingresos: 1000, gastos: 300, retiros: 0, balance: 700, excludedMovements: 0 }

test('monthly answers use verified totals and answer the requested metric in Spanish', () => {
  const cases = [
    ['¿Cuánto gasté este mes?', 'gastos', '300.00'],
    ['¿Cuáles fueron mis ingresos?', 'ingresos', '1000.00'],
    ['¿Cuánto recibí?', 'ingresos', '1000.00'],
    ['¿Cuál es mi balance?', 'balance', '700.00'],
    ['¿Cuánto retiré?', 'retiros', '0.00']
  ]
  for (const [question, label, value] of cases) {
    const result = formatMonthlyReport(summary, question!)
    assert.match(result, /Fede/)
    assert.ok(result.toLowerCase().includes(label!))
    assert.ok(result.includes(`₡${value}`))
    assert.equal(result.split('\n').length, 1)
  }
})

test('summary and multi-metric requests keep all totals and always disclose excluded records', () => {
  for (const question of ['Resumen mensual', '¿Cuánto ingresé y cuánto gasté?']) {
    const result = formatMonthlyReport({ ...summary, excludedMovements: 2 }, question)
    for (const value of ['1000.00', '300.00', '0.00', '700.00']) assert.ok(result.includes(`₡${value}`))
    assert.match(result, /2 movimientos excluidos/)
    assert.ok(!/Summary for|Excluded for review/.test(result))
  }
})

test('a monthly total is not presented as the answer to a category breakdown', () => {
  const result = formatMonthlyReport(summary, '¿En qué categoría gasté más este mes?')
  assert.match(result, /todavía no responde desgloses/)
  assert.ok(!result.includes('₡300.00'))
})

function movement(id: string, overrides: Partial<Task> = {}): Task {
  return { id, description: 'Compra de prueba', owner: 'Comida', deadline: '2026-10-13', priority: 'medium', status: 'completed', rockId: '', sprintId: '', monto: '0.10', tipo: 'gasto', createdAt: '2026-10-13T18:00:00.000Z', ...overrides }
}

test('category report ranks owned expenses using exact cents and excludes income/withdrawals', () => {
  const items = [movement('T-AAAA'), movement('T-AAAB', { monto: '0.20' }), movement('T-AAAC', { owner: 'Transporte', monto: '0.20' }), movement('T-AAAD', { tipo: 'ingreso', monto: '9999.00' }), movement('T-AAAE', { tipo: 'retiro', monto: '500.00' })]
  const result = formatCategoryReport({ items, excluded: 2 }, '2026-10')
  assert.ok(result.includes('Comida: ₡0.30'))
  assert.ok(result.includes('Transporte: ₡0.20'))
  assert.ok(result.indexOf('Comida') < result.indexOf('Transporte'))
  assert.match(result, /2 movimientos excluidos/)
  assert.ok(!/9999|500\.00/.test(result))
})

test('empty reports are explicit and large category results disclose their display limit', () => {
  assert.match(formatCategoryReport({ items: [], excluded: 0 }, '2026-09'), /no hay gastos registrados.*2026-09/)
  const items = Array.from({ length: 21 }, (_, index) => movement(`T-${index}`, { owner: `Categoria ${index}` }))
  assert.match(formatCategoryReport({ items, excluded: 0 }, '2026-10'), /20 de 21/)
  assert.match(formatRecentMovements({ items: [], excluded: 1 }, 5), /no hay movimientos registrados/)
})

test('recent movements use date/time order without mutating inputs and state the actual scope/count', () => {
  const older = movement('T-AAAA', { deadline: '2026-09-01', description: 'Movimiento antiguo' })
  const recent = movement('T-AAAB', { description: 'Movimiento reciente', createdAt: '2026-10-13T19:00:00.000Z' })
  const items = [older, recent, movement('T-AAAC')]
  const result = formatRecentMovements({ items, excluded: 0 }, 2)
  assert.ok(result.includes('2 de 3'))
  assert.ok(result.includes('todo el historial'))
  assert.ok(result.indexOf('Movimiento reciente') < result.indexOf('Compra de prueba'))
  assert.ok(!result.includes('Movimiento antiguo'))
  assert.equal(items[0], older)
  assert.match(formatRecentMovements({ items: [recent], excluded: 0 }, 5, '2026-10'), /2026-10/)
})

test('recent movement display limits fail closed and stored text cannot inject markdown links/images', () => {
  for (const limit of [0, -1, 21, 1.5]) assert.throws(() => formatRecentMovements({ items: [], excluded: 0 }, limit))
  const malicious = movement('T-AAAA', { description: '![image](https://example.invalid)\nOtra línea', owner: '[link](https://example.invalid)' })
  const result = formatRecentMovements({ items: [malicious], excluded: 0 }, 5)
  assert.ok(!result.includes('![image]('))
  assert.ok(!result.includes('[link]('))
  assert.ok(!result.includes('\nOtra línea'))
  const category = formatCategoryReport({ items: [malicious], excluded: 0 }, '2026-10')
  assert.ok(!category.includes('[link]('))
})

function cuota(id: string, overrides: Partial<Cuota> = {}): Cuota {
  return { id, nombre: id, frecuencia: 'mensual', monto: '0.10', categoria: 'Prueba', ultimoPago: null, status: 'active', createdAt: '2026-10-01T18:00:00.000Z', ...overrides }
}
const quotaToday = '2026-10-14'
const quotaRows = [
  cuota('Pendiente mensual uno'),
  cuota('Pendiente mensual dos', { monto: '0.20', ultimoPago: '2026-09-10' }),
  cuota('Pagada mensual', { ultimoPago: '2026-10-10' }),
  cuota('Pagada anual', { frecuencia: 'anual', monto: '120.00', ultimoPago: '2026-01-10' }),
  cuota('Pendiente anual', { frecuencia: 'anual', monto: '120.00', ultimoPago: '2025-10-10' }),
  cuota('Pausada', { status: 'paused' })
]

test('pending cuotas exclude paid and paused records and keep monthly/annual amounts separate', () => {
  const result = formatCuotaReport(quotaRows, '¿Qué cuotas tengo pendientes este mes?', quotaToday)
  assert.ok(result.includes('Pendiente mensual uno'))
  assert.ok(result.includes('Pendiente mensual dos'))
  assert.ok(result.includes('Pendiente anual'))
  assert.ok(!result.includes('Pagada mensual'))
  assert.ok(!result.includes('Pagada anual'))
  assert.ok(!result.includes('- Pausada'))
  assert.ok(result.includes('Mensuales: ₡0.30'))
  assert.ok(result.includes('Anuales: ₡120.00'))
  assert.match(result, /no indica.*vencimiento/)
})

test('paid, unpaid and paused cuota questions respect current-month and current-year periods', () => {
  const paid = formatCuotaReport([...quotaRows, cuota('Anual recién pagada', { frecuencia: 'anual', ultimoPago: '2026-10-10' })], '¿Qué cuotas ya pagué este mes?', quotaToday)
  assert.ok(paid.includes('Pagada mensual'))
  assert.ok(paid.includes('Anual recién pagada'))
  assert.ok(!paid.includes('Pagada anual'))
  assert.match(paid, /último pago registrado en 2026-10/)
  assert.ok(!paid.includes('Pendiente mensual'))
  const unpaid = formatCuotaReport(quotaRows, 'Muéstrame las cuotas no pagadas', quotaToday)
  assert.ok(unpaid.includes('Pendiente mensual uno'))
  assert.ok(!unpaid.includes('Pagada mensual'))
  const notPaid = formatCuotaReport(quotaRows, '¿Qué cuotas no pagué este mes?', quotaToday)
  assert.ok(notPaid.includes('Pendiente mensual uno'))
  assert.ok(!notPaid.includes('Pagada mensual'))
  const paused = formatCuotaReport(quotaRows, 'Muéstrame cuotas pausadas', quotaToday)
  assert.ok(paused.includes('Pausada'))
  assert.ok(!paused.includes('Pendiente mensual'))
  const annual = formatCuotaReport(quotaRows, 'Cuotas anuales pagadas este año', quotaToday)
  assert.ok(annual.includes('Pagada anual'))
  assert.ok(!annual.includes('Pagada mensual'))
})

test('cuota history and due dates are not invented from a single last-payment field', () => {
  assert.match(formatCuotaReport(quotaRows, 'Cuotas pagadas el mes pasado', quotaToday), /historial|histórico/)
  assert.match(formatCuotaReport(quotaRows, 'Cuotas de 2026-13', quotaToday), /mes válido/)
  assert.match(formatCuotaReport(quotaRows, 'Cuotas anuales de 2026-13', quotaToday), /mes válido/)
  assert.match(formatCuotaReport(quotaRows, 'Cuotas anuales pagadas en diciembre de 2026', quotaToday), /mes válido/)
  assert.match(formatCuotaReport(quotaRows, 'Cuotas anuales de 2026-10-12', quotaToday), /mes válido/)
  assert.match(formatCuotaReport(quotaRows, '¿Cuándo vencen mis cuotas?', quotaToday), /no.*fecha de vencimiento/i)
})

test('invalid payment dates, future payments and invalid amounts require review, not false pending balances', () => {
  const rows = [cuota('Fecha inválida', { ultimoPago: '2026-99-99' }), cuota('Pago futuro', { ultimoPago: '2026-10-31' }), cuota('Monto inválido', { monto: '-100' })]
  const result = formatCuotaReport(rows, 'Cuotas pendientes', quotaToday)
  assert.match(result, /3 cuotas.*revisión/)
  assert.ok(!result.includes('- Fecha inválida'))
  assert.ok(!result.includes('- Pago futuro'))
  assert.ok(!result.includes('₡-100'))
})

test('cuota output preserves records, escapes names and discloses display limits', () => {
  const rows = Array.from({ length: 21 }, (_, index) => cuota(`Cuota ${index}`, { nombre: '![image](https://example.invalid)' }))
  const before = JSON.stringify(rows)
  const result = formatCuotaReport(rows, 'Lista mis cuotas', quotaToday)
  assert.match(result, /20 de 21/)
  assert.ok(!result.includes('![image]('))
  assert.equal(JSON.stringify(rows), before)
})
