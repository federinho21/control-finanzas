import assert from 'node:assert/strict'
import { test } from 'node:test'
import { amountMinor, amountText, costaRicaDate, deriveSprintStatus, importedPayment, monthWindow, movementInput, summarize } from '../server/repositories/finance-model'
import * as financeModel from '../server/repositories/finance-model'

test('decimal money uses exact integer minor units and rejects excessive precision/invalid values', () => {
  assert.equal(amountMinor('0.10') + amountMinor('0,20'), 30)
  assert.equal(amountText(150050), '1500.50')
  for (const value of [-1, NaN, Infinity, '1.005', '1e3', '', '10000000000.01']) assert.throws(() => amountMinor(value))
  assert.equal(movementInput.safeParse({ fecha: '2026-10-13', tipo: 'gasto', descripcion: 'Test', categoria: 'Test', monto: '0' }).success, false)
})

test('month windows use Costa Rica boundaries, leap years and reject impossible months', () => {
  assert.equal(monthWindow('2024-02').endDate, '2024-02-29')
  assert.equal(monthWindow('2026-02').endDate, '2026-02-28')
  assert.equal(costaRicaDate(Date.parse('2026-10-13T05:59:59Z')), '2026-10-12')
  assert.equal(monthWindow('2026-10').startTime, Date.parse('2026-10-01T06:00:00Z'))
  for (const month of ['2026-00', '2026-13', '2026-1', 'bad']) assert.throws(() => monthWindow(month))
})

test('strict movement input rejects forged owner fields, parent path traversal and invalid dates', () => {
  const input = { fecha: '2026-10-13', tipo: 'gasto', descripcion: 'Test', categoria: 'Test', monto: '12.30' }
  assert.equal(movementInput.parse(input).monto, 1230)
  for (const extra of [{ userId: 'victim' }, { rockId: '../victim' }, { fecha: '2026-02-30' }]) assert.equal(movementInput.safeParse({ ...input, ...extra }).success, false)
})

test('Android payments map directions, preserve source IDs and never include raw private text', () => {
  const source = { amount: 1500.5, currency: 'CRC', parsed: true, timestamp: Date.parse('2026-10-13T05:00:00Z'), merchant: 'Store', rawText: 'PRIVATE RAW TEXT' }
  const payment = importedPayment('source-id', source)!
  assert.equal(payment.id, 'source-id')
  assert.equal(payment.monto, '1500.50')
  assert.equal(payment.deadline, '2026-10-12')
  assert.equal(payment.tipo, 'gasto')
  assert.equal(payment.status, 'completed')
  assert.ok(!JSON.stringify(payment).includes('PRIVATE RAW TEXT'))
  assert.equal(importedPayment('source-id', { ...source, direction: 'incoming' })?.tipo, 'ingreso')
  for (const extra of [{ parsed: false }, { currency: 'USD' }, { amount: null }, { transactionType: 'sinpe' }, { direction: 'unknown' }]) assert.equal(importedPayment('source-id', { ...source, ...extra }), null)
})

test('summary avoids 0.1+0.2 drift and derives sprint status consistently', () => {
  const source = { amount: 0.1, currency: 'CRC', parsed: true, timestamp: Date.now() }
  assert.equal(summarize([importedPayment('one', source)!, importedPayment('two', { ...source, amount: 0.2 })!]).gastos, 0.3)
  assert.equal(deriveSprintStatus([]), 'planned')
  assert.equal(deriveSprintStatus([{ status: 'pending' }]), 'planned')
  assert.equal(deriveSprintStatus([{ status: 'completed' }]), 'completed')
  assert.equal(deriveSprintStatus([{ status: 'on_hold' }]), 'on_hold')
  assert.equal(deriveSprintStatus([{ status: 'completed' }, { status: 'pending' }]), 'in_progress')
})

test('chat movement drafts preserve major currency units across validation and forbid hidden authority', () => {
  const draft = { fecha: costaRicaDate(), tipo: 'gasto', descripcion: 'Almuerzo', categoria: 'Comida', monto: '25', currency: 'CRC' }
  const parsed = financeModel.movementDraft.parse(draft)
  assert.equal(parsed.monto, '25.00')
  assert.deepEqual(financeModel.movementDraft.parse(parsed), parsed)
  for (const extra of [{ userId: 'victim' }, { rockId: 'R-AAAA' }, { currency: 'USD' }, { monto: '0' }, { monto: '1.005' }, { fecha: '9999-12-31' }, { categoria: '' }]) {
    assert.equal(financeModel.movementDraft.safeParse({ ...draft, ...extra }).success, false)
  }
})
