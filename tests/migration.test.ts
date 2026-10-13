import assert from 'node:assert/strict'
import { test } from 'node:test'
import { digest, migrationPlan } from '../scripts/migration-model'

export function sourceSnapshot() {
  return {
    rocks: [{ id: 'R-TEST', name: 'Account', description: 'Legacy', deadline: '2020-01-31', status: 'active', created_at: '2020-01-01T00:00:00.000Z' }],
    sprints: [{ id: 'S-TEST', name: 'Period', start_date: '2020-01-01', end_date: '2020-01-31', rock_id: 'R-TEST', status: 'planned', created_at: '2020-01-01T00:00:00.000Z' }],
    tasks: [{ id: 'T-TEST', description: 'Expense', owner: 'Fede', deadline: '2020-01-05', priority: 'high', status: 'pending', rock_id: 'R-TEST', sprint_id: 'S-TEST', monto: '0.10', tipo: 'gasto', created_at: '2020-01-01T00:00:00.000Z' }],
    cuotas: [], documents: [], document_chunks: []
  }
}
test('migration preserves historical IDs, dates, exact money and does not mutate the snapshot', () => {
  const source = sourceSnapshot(), original = JSON.stringify(source), plan = migrationPlan(source, 'A')
  assert.equal(plan.records.length, 3)
  assert.equal(plan.records[2]?.data.amountMinor, 10)
  assert.equal(plan.records[2]?.data.deadline, '2020-01-05')
  assert.equal(JSON.stringify(source), original)
  assert.equal(migrationPlan(source, 'A').hash, plan.hash)
  assert.notEqual(migrationPlan(source, 'B').hash, plan.hash)
})
test('migration rejects broken relationships, duplicate IDs, unsafe UID and invalid money', () => {
  const source = sourceSnapshot()
  source.tasks[0]!.sprint_id = 'S-MISS'
  assert.throws(() => migrationPlan(source, 'A'))
  const duplicate = sourceSnapshot(); duplicate.rocks.push(duplicate.rocks[0]!)
  assert.throws(() => migrationPlan(duplicate, 'A'))
  assert.throws(() => migrationPlan(sourceSnapshot(), '../B'))
  const money = sourceSnapshot(); money.tasks[0]!.monto = '1.005'
  assert.throws(() => migrationPlan(money, 'A'))
})
test('migration hashes are independent of Firestore object field ordering', () => {
  assert.equal(digest({ a: 1, b: { c: 2, d: 3 } }), digest({ b: { d: 3, c: 2 }, a: 1 }))
})

test('migration preserves extracted documents and refuses incompatible or orphan embeddings', () => {
  const source = { ...sourceSnapshot(), documents: [{ id: 1, filename: 'invoice.pdf', content: 'Invoice text', rock_id: 'R-TEST', temp_id: null, created_at: '2020-01-01T00:00:00.000Z' }], document_chunks: [{ id: 1, document_id: 1, chunk_text: 'Invoice text', embedding: JSON.stringify(Array(3072).fill(0.1)) }] }
  const plan = migrationPlan(source, 'A')
  assert.equal(plan.files[0]?.text, 'Invoice text')
  assert.equal(plan.records.find(row => row.path === 'users/A/documents/legacy-1')?.data.originalAvailable, false)
  assert.equal(plan.records.find(row => row.path === 'users/A/documents/legacy-1')?.data.status, 'ready')
  source.document_chunks[0]!.embedding = '[1,2]'
  assert.throws(() => migrationPlan(source, 'A'))
  source.documents = []
  assert.throws(() => migrationPlan(source, 'A'))
})
