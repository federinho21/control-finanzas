import { expect, test, type Page } from '@playwright/test'
import { startTestServer } from './start-test-server'

let server: Awaited<ReturnType<typeof startTestServer>>
test.beforeAll(async () => { server = await startTestServer() })
test.afterAll(() => { server?.stop() })

async function mockSession(page: Page, initialUser: string | null) {
  const state = { uid: null as string | null, logoutFails: false, chatExpired: false }
  const errors: string[] = []
  const blockedResources = new Set<string>()
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() !== 'error' && message.type() !== 'warning') return
    const text = message.text()
    if (text.includes('Failed to load resource') && (text.includes('401') || (state.logoutFails && text.includes('net::ERR_FAILED')))) return
    if (text.includes('net::ERR_FAILED') && blockedResources.has(message.location().url)) return
    errors.push(`${text} (${message.location().url})`)
  })
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === server.url) return route.continue()
    blockedResources.add(route.request().url())
    return route.abort()
  })
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.startsWith('/api/_nuxt_icon/')) return route.continue()
    if (path === '/api/auth/me') {
      return route.fulfill({ status: state.uid ? 200 : 401, json: state.uid ? { user: { uid: state.uid } } : { statusCode: 401 } })
    }
    if (path === '/api/auth/session') {
      if (state.logoutFails) return route.abort()
      state.uid = null
      return route.fulfill({ json: { ok: true } })
    }
    if (path === '/api/chat') {
      if (state.chatExpired) {
        state.uid = null
        return route.fulfill({ status: 401, json: { statusCode: 401 } })
      }
      return route.fulfill({ contentType: 'text/event-stream', body: [
        { type: 'result', message: `PRIVATE CHAT ${state.uid}`, refreshBacklog: false },
        { type: 'judge', message: 'TEST JUDGE' },
        { type: 'guardrail', message: 'TEST GUARDRAIL' }, { type: 'done' }
      ].map(event => `data: ${JSON.stringify(event)}\n\n`).join('') })
    }
    if (path === '/api/dashboard') return route.fulfill({ json: { month: '2026-10', ingresos: state.uid === 'A' ? 123 : 456, gastos: 0, retiros: 0, balance: 0, movementsCount: 0, byCategory: [], totals: { ingresos: 0, gastos: 0, retiros: 0 }, cuotas: { total: 0, activas: 0, pendientes: 0 } } })
    if (path === '/api/resumen') return route.fulfill({ json: { month: '2026-10', ingresos: 0, gastos: 0, retiros: 0, balance: 0, movements: [] } })
    return route.fulfill({ json: [] })
  })
  async function enter() {
    await page.goto(`${server.url}/login`)
    if (!initialUser) return
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Continuar con Google' }).click()
    await expect(page.getByRole('alert')).toContainText('No se pudo iniciar sesión')
    state.uid = initialUser
    await page.getByRole('button', { name: 'Comprobar sesión nuevamente' }).click()
    await expect(page).toHaveURL(server.url + '/')
  }
  return { state, errors, enter }
}

test('unauthenticated deep links redirect without private content; mobile login is accessible', async ({ page }, info) => {
  const { errors } = await mockSession(page, null)
  let privateRequests = 0
  page.on('request', request => { if (/\/api\/(dashboard|tasks|resumen|chat)$/.test(new URL(request.url()).pathname)) privateRequests++ })
  for (const path of ['/', '/dashboard', '/finanzas', '/preview']) {
    await page.goto(`${server.url}${path}`)
    await expect(page).toHaveURL(`${server.url}/login`)
    await expect(page.getByRole('heading', { name: 'Control Finanzas' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toHaveCount(0)
  }
  expect(privateRequests).toBe(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('checkbox').check()
  await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeEnabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('login-mobile.png'), fullPage: true })
  expect(errors).toEqual([])
})

test('missing Firebase configuration reports a generic recoverable login failure', async ({ page }) => {
  const { errors } = await mockSession(page, null)
  await page.goto(`${server.url}/login`)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Continuar con Google' }).click()
  await expect(page.getByRole('alert')).toContainText('No se pudo iniciar sesión')
  await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeEnabled()
  expect(errors).toEqual([])
})

test('cookie recheck, ordered SSE and logout clear user chat on desktop', async ({ page }) => {
  const { state, errors, enter } = await mockSession(page, 'A')
  await enter()
  await expect(page).toHaveURL(server.url + '/')
  const input = page.getByPlaceholder('Escribe una instrucción para el Asistente Financiero')
  await input.fill('test message')
  await input.press('Enter')
  await expect(page.getByText('PRIVATE CHAT A', { exact: true })).toBeVisible()
  await expect(page.getByText('TEST JUDGE', { exact: true })).toBeVisible()
  await expect(page.getByText('TEST GUARDRAIL', { exact: true })).toBeVisible()
  const text = await page.locator('body').innerText()
  expect(text.indexOf('PRIVATE CHAT A')).toBeLessThan(text.indexOf('TEST JUDGE'))
  expect(text.indexOf('TEST JUDGE')).toBeLessThan(text.indexOf('TEST GUARDRAIL'))
  await page.getByRole('button', { name: 'Cerrar sesión' }).first().click()
  await expect(page).toHaveURL(server.url + '/login')
  expect(state.uid).toBeNull()
  await expect(page.getByText('PRIVATE CHAT A', { exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page).toHaveURL(server.url + '/login')
  expect(errors).toEqual([])
})

test('switching cookie identity removes old chat and reloads dashboard data', async ({ page }) => {
  const { state, errors, enter } = await mockSession(page, 'A')
  await enter()
  const input = page.getByPlaceholder('Escribe una instrucción para el Asistente Financiero')
  await input.fill('test message')
  await input.press('Enter')
  await expect(page.getByText('PRIVATE CHAT A', { exact: true })).toBeVisible()
  state.uid = 'B'
  await page.getByRole('link', { name: 'Dashboard', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: 'Dashboard Financiero' })).toBeVisible()
  await expect(page.getByText(/^₡456[.,]00$/)).toBeVisible()
  await page.getByRole('link', { name: 'IA', exact: true }).first().click()
  await expect(input).toBeVisible()
  await expect(page.getByText('PRIVATE CHAT A', { exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('failed logout blocks re-login and can be retried safely', async ({ page }) => {
  const { state, errors, enter } = await mockSession(page, 'A')
  await enter()
  state.logoutFails = true
  await page.getByRole('button', { name: 'Cerrar sesión' }).first().click()
  await expect(page).toHaveURL(server.url + '/login')
  await expect(page.getByRole('alert')).toContainText('No se pudo confirmar el cierre')
  await expect(page.getByRole('button', { name: 'Continuar con Google' })).toHaveCount(0)
  state.logoutFails = false
  await page.getByRole('button', { name: 'Reintentar cierre de sesión' }).click()
  await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible()
  expect(state.uid).toBeNull()
  expect(errors).toEqual([])
})

test('401 from streaming chat returns to login and clears the conversation', async ({ page }) => {
  const { state, errors, enter } = await mockSession(page, 'A')
  await enter()
  state.chatExpired = true
  const input = page.getByPlaceholder('Escribe una instrucción para el Asistente Financiero')
  await input.fill('PRIVATE USER PROMPT')
  await input.press('Enter')
  await expect(page).toHaveURL(server.url + '/login')
  await expect(page.getByText('PRIVATE USER PROMPT', { exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('logout in one tab clears the other tab without sharing tokens or user IDs', async ({ page, context }) => {
  const first = await mockSession(page, 'A')
  const otherPage = await context.newPage()
  const other = await mockSession(otherPage, 'A')
  await first.enter()
  await other.enter()
  await expect(otherPage.getByPlaceholder('Escribe una instrucción para el Asistente Financiero')).toBeVisible()
  other.state.uid = null
  await page.getByRole('button', { name: 'Cerrar sesión' }).first().click()
  await expect(otherPage).toHaveURL(server.url + '/login')
  await expect(otherPage.getByRole('heading', { name: 'Control Finanzas' })).toBeVisible()
  await expect(otherPage.getByRole('button', { name: 'Cerrar sesión' })).toHaveCount(0)
  expect(first.errors).toEqual([])
  expect(other.errors).toEqual([])
})

test('mobile navigation exposes a working accessible logout control', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const { enter, errors } = await mockSession(page, 'A')
  await enter()
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(server.url + '/login')
  await expect(page.getByRole('heading', { name: 'Control Finanzas' })).toBeVisible()
  expect(errors).toEqual([])
})

test('movement confirmation buttons submit only the bound action and preserve the chat session', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const { enter, errors } = await mockSession(page, 'A')
  let actionId = '', sessionId = '', actionsSent = 0, failAction = false
  await page.route('**/api/chat', async route => {
    const body = route.request().postDataJSON()
    if (!body.action) { sessionId = body.sessionId; actionId = crypto.randomUUID() }
    else {
      expect(body.sessionId).toBe(sessionId)
      expect(body.action.actionId).toBe(actionId)
      expect(body.action.payload).toBeUndefined()
      expect(['approve_movement', 'cancel_movement']).toContain(body.action.type)
      actionsSent++
    }
    const result = body.action && failAction ? { type: 'error', message: 'Fallo temporal. Puedes reintentar.' } : body.action
      ? { type: 'result', message: body.action.type === 'approve_movement' ? 'Movimiento registrado una sola vez.' : 'Propuesta cancelada sin movimiento.', resolvedActionId: actionId }
      : { type: 'result', message: 'Fede, revisa: gasto de ₡25.00 por Almuerzo en Comida. Aún no está registrado.', actionRequest: { type: 'approve_movement', actionId, prompt: 'Revisa y confirma.' } }
    await route.fulfill({ contentType: 'text/event-stream', body: [result, { type: 'done' }].map(event => `data: ${JSON.stringify(event)}\n\n`).join('') })
  })
  await enter()
  const input = page.getByPlaceholder('Escribe una instrucción para el Asistente Financiero')
  await input.fill('Registra un gasto de 25 colones por almuerzo en Comida hoy.')
  await input.press('Enter')
  await expect(page.getByText(/Aún no está registrado/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancelar movimiento', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('movement-confirmation-mobile.png'), fullPage: true })
  await page.getByRole('button', { name: 'Confirmar movimiento', exact: true }).click()
  await expect(page.getByText('Movimiento registrado una sola vez.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirmar movimiento', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Cancelar movimiento', exact: true })).toHaveCount(0)
  expect(actionsSent).toBe(1)
  await input.fill('Prepara otro movimiento de prueba para cancelarlo.')
  await input.press('Enter')
  await expect(page.getByRole('button', { name: 'Cancelar movimiento', exact: true })).toHaveCount(1)
  await page.getByRole('button', { name: 'Cancelar movimiento', exact: true }).last().click()
  await expect(page.getByText('Propuesta cancelada sin movimiento.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancelar movimiento', exact: true })).toHaveCount(0)
  expect(actionsSent).toBe(2)
  await input.fill('Prepara otro movimiento para probar un fallo temporal.')
  await input.press('Enter')
  await expect(page.getByRole('button', { name: 'Confirmar movimiento', exact: true })).toBeVisible()
  failAction = true
  await page.getByRole('button', { name: 'Confirmar movimiento', exact: true }).click()
  await expect(page.getByText('Fallo temporal. Puedes reintentar.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirmar movimiento', exact: true })).toBeVisible()
  failAction = false
  await page.getByRole('button', { name: 'Confirmar movimiento', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Confirmar movimiento', exact: true })).toHaveCount(0)
  expect(actionsSent).toBe(4)
  expect(errors).toEqual([])
})
