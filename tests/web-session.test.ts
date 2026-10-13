import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createWebSession, SessionChangedError, type WebAuthState } from '../app/utils/web-session'

function fixture() {
  const state: WebAuthState = { user: null, ready: false, busy: false, error: '', logoutUnconfirmed: false }
  const calls: string[] = []
  const actions = {
    async me() { calls.push('me'); return { user: { uid: 'A' } } },
    async googleToken() { calls.push('google'); return 'temporary-token' },
    async create(token: string) { assert.equal(token, 'temporary-token'); calls.push('create') },
    async remove() { calls.push('remove') },
    reset() { calls.push('reset') },
    expired() { calls.push('expired') }
  }
  const session = createWebSession(state, actions)
  return { state, actions, session, calls }
}

test('restores cookie session; duplicate initial checks share one request', async () => {
  const { session, state, calls } = fixture()
  await Promise.all([session.restore(), session.restore()])
  assert.equal(state.user?.uid, 'A')
  assert.equal(state.ready, true)
  assert.equal(calls.filter(call => call === 'me').length, 1)
})

test('missing/invalid session stays signed out; service failure reports generic error', async () => {
  for (const statusCode of [401, 503]) {
    const { session, state, actions } = fixture()
    actions.me = async () => { throw { statusCode, secret: 'internal' } }
    await session.restore()
    assert.equal(state.user, null)
    assert.equal(state.ready, true)
    assert.equal(Boolean(state.error), statusCode === 503)
    assert.ok(!state.error.includes('internal'))
  }
})

test('login exchanges temporary token, re-verifies cookie, never stores the token in state', async () => {
  const { session, state, calls } = fixture()
  assert.equal(await session.signIn(), true)
  assert.deepEqual(calls, ['reset', 'google', 'create', 'me'])
  assert.equal(state.user?.uid, 'A')
  assert.ok(!JSON.stringify(state).includes('temporary-token'))
})

test('failed/cancelled popup does not issue a backend session or leave a user', async () => {
  const { session, state, calls, actions } = fixture()
  actions.googleToken = async () => { throw { code: 'auth/popup-closed-by-user' } }
  assert.equal(await session.signIn(), false)
  assert.equal(state.user, null)
  assert.equal(state.busy, false)
  assert.ok(state.error.includes('canceló'))
  assert.ok(!calls.includes('create'))
})

test('changed user resets private state before displaying the new account', async () => {
  const { session, state, actions, calls } = fixture()
  await session.restore()
  calls.length = 0
  actions.me = async () => ({ user: { uid: 'B' } })
  await session.restore(true)
  assert.equal(state.user?.uid, 'B')
  assert.deepEqual(calls, ['reset'])
})

test('logout resets immediately, aborts private requests and drops late responses', async () => {
  const { session, state } = fixture()
  await session.restore()
  let complete!: (value: string) => void
  let signal!: AbortSignal
  const request = session.request(s => { signal = s; return new Promise<string>(resolve => { complete = resolve }) })
  await session.logout()
  assert.equal(state.user, null)
  assert.equal(signal.aborted, true)
  complete('private data from A')
  await assert.rejects(request, SessionChangedError)
})

test('logout network failure blocks login and restore until explicit retry succeeds', async () => {
  const { session, state, actions } = fixture()
  await session.restore()
  actions.remove = async () => { throw new Error('network') }
  assert.equal(await session.logout(), false)
  assert.equal(state.logoutUnconfirmed, true)
  assert.equal(state.user, null)
  assert.equal(await session.signIn(), false)
  await session.restore(true)
  assert.equal(state.user, null)
  actions.remove = async () => {}
  assert.equal(await session.logout(), true)
  assert.equal(state.logoutUnconfirmed, false)
})

test('already expired cookie logout is treated as signed out', async () => {
  const { session, state, actions } = fixture()
  actions.remove = async () => { throw { statusCode: 401 } }
  assert.equal(await session.logout(), true)
  assert.equal(state.user, null)
  assert.equal(state.logoutUnconfirmed, false)
})

test('401 private response invalidates session and redirects; 403 does not', async () => {
  for (const status of [401, 403]) {
    const { session, state, calls } = fixture()
    await session.restore()
    await assert.rejects(session.request(async () => { throw { response: { status } } }))
    assert.equal(state.user === null, status === 401)
    assert.equal(calls.includes('expired'), status === 401)
  }
})

test('requests never execute without a verified user', async () => {
  const { session, actions } = fixture()
  actions.me = async () => { throw { statusCode: 401 } }
  let requested = false
  await assert.rejects(session.request(async () => { requested = true }), SessionChangedError)
  assert.equal(requested, false)
})

test('late session restoration cannot resurrect a logged out account', async () => {
  const { session, state, actions } = fixture()
  let complete!: (value: { user: { uid: string } }) => void
  actions.me = () => new Promise(resolve => { complete = resolve })
  const restore = session.restore()
  await session.logout()
  complete({ user: { uid: 'A' } })
  await restore
  assert.equal(state.user, null)
})

test('duplicate login clicks issue only one token exchange', async () => {
  const { session, actions, calls } = fixture()
  let complete!: (token: string) => void
  actions.googleToken = () => new Promise(resolve => { complete = resolve })
  const first = session.signIn()
  assert.equal(await session.signIn(), false)
  complete('temporary-token')
  assert.equal(await first, true)
  assert.equal(calls.filter(call => call === 'create').length, 1)
})

test('failed token exchange never marks the user authenticated', async () => {
  const { session, actions, state } = fixture()
  actions.create = async () => { throw { statusCode: 401 } }
  assert.equal(await session.signIn(), false)
  assert.equal(state.user, null)
  assert.equal(state.busy, false)
})
