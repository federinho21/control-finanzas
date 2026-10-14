import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSafeFallbackIntent } from '../server/agents/supervisor'
import * as dataAgent from '../server/agents/data-agent'

const { formatMonthlyReport, resolveReportMonth } = dataAgent

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
