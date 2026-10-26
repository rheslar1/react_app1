import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'Sign in to continue.' }, 401)))
})

test('shows sign-in and registration views after restoring an anonymous session', async () => {
  render(<App />)
  expect(await screen.findByRole('heading', { name: /welcome back/i })).toBeTruthy()
  expect(screen.getByRole('tab', { name: /create account/i })).toBeTruthy()
  await userEvent.click(screen.getByRole('tab', { name: /create account/i }))
  expect(screen.getByRole('heading', { name: /create your account/i })).toBeTruthy()
  expect(screen.getByLabelText(/work email/i)).toBeTruthy()
})

test('registration authenticates and displays the sample operator console and API health', async () => {
  const user = userEvent.setup()
  fetch.mockImplementation((url) => {
    if (url.endsWith('/auth/me')) return Promise.resolve(jsonResponse({ error: 'Sign in to continue.' }, 401))
    if (url.endsWith('/auth/register')) return Promise.resolve(jsonResponse({ user: { email: 'ops@example.com' } }, 201))
    if (url.endsWith('/health')) {
      return Promise.resolve(jsonResponse({
        api: 'healthy',
        database: 'healthy',
        checkedAt: '2026-10-22T10:00:00Z',
        deployment: { version: '2.4.0', revision: 'abc1234', imageDigest: 'sha256:1234', environment: 'staging', configured: true },
      }))
    }
    throw new Error(`Unexpected request: ${url}`)
  })
  render(<App />)
  await user.click(await screen.findByRole('tab', { name: /create account/i }))
  await user.type(screen.getByLabelText(/work email/i), 'ops@example.com')
  await user.type(screen.getByLabelText(/password/i), 'safe-password')
  await user.click(screen.getByRole('button', { name: /create account/i }))

  expect(await screen.findByRole('heading', { name: /station console dashboard/i })).toBeTruthy()
  expect(screen.getByRole('heading', { name: /st-04 voltage & continuity/i })).toBeTruthy()
  expect(screen.getByText(/sample data · no equipment connection/i)).toBeTruthy()
  expect(screen.getByText('ops@example.com')).toBeTruthy()
  expect(await screen.findByText(/api health · healthy/i)).toBeTruthy()
  expect(fetch).toHaveBeenCalledWith('/api/auth/register', expect.objectContaining({
    method: 'POST',
    credentials: 'same-origin',
    body: JSON.stringify({ email: 'ops@example.com', password: 'safe-password' }),
  }))
})

test('shows deliberate login errors', async () => {
  fetch.mockImplementation((url) => {
    if (url.endsWith('/auth/me')) return Promise.resolve(jsonResponse({}, 401))
    return Promise.resolve(jsonResponse({ error: 'Email or password is incorrect.' }, 401))
  })
  const user = userEvent.setup()
  render(<App />)
  await user.type(await screen.findByLabelText(/work email/i), 'ops@example.com')
  await user.type(screen.getByLabelText(/password/i), 'wrong-password')
  await user.click(screen.getByRole('button', { name: /sign in to relay/i }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/email or password is incorrect/i))
})

test('successful login restores the operator console and reports unavailable API health', async () => {
  fetch.mockImplementation((url) => {
    if (url.endsWith('/auth/me')) return Promise.resolve(jsonResponse({}, 401))
    if (url.endsWith('/auth/login')) return Promise.resolve(jsonResponse({ user: { email: 'ops@example.com' } }))
    if (url.endsWith('/health')) {
      return Promise.resolve(jsonResponse({
        api: 'healthy',
        database: 'unavailable',
        deployment: { configured: false },
      }))
    }
    throw new Error(`Unexpected request: ${url}`)
  })
  const user = userEvent.setup()
  render(<App />)
  await user.type(await screen.findByLabelText(/work email/i), 'ops@example.com')
  await user.type(screen.getByLabelText(/password/i), 'correct-password')
  await user.click(screen.getByRole('button', { name: /sign in to relay/i }))
  expect(await screen.findByRole('heading', { name: /station console dashboard/i })).toBeTruthy()
  expect(await screen.findByText(/api health · attention needed/i)).toBeTruthy()
  await user.click(screen.getByText(/api health · attention needed/i))
  expect(screen.getByText('Unavailable')).toBeTruthy()
  expect(fetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST' }))
})

test('reports failed health checks as unknown without presenting sample data as live', async () => {
  fetch.mockImplementation((url) => {
    if (url.endsWith('/auth/me')) return Promise.resolve(jsonResponse({ user: { email: 'ops@example.com' } }))
    if (url.endsWith('/health')) return Promise.resolve(jsonResponse({ error: 'Health service unavailable.' }, 503))
    throw new Error(`Unexpected request: ${url}`)
  })
  render(<App />)

  expect(await screen.findByText(/api health · unknown/i)).toBeTruthy()
  expect(screen.getByText(/sample data · no equipment connection/i)).toBeTruthy()
  expect(screen.getAllByRole('alert').some((message) => /health service unavailable/i.test(message.textContent))).toBe(true)
})

test('does not treat an unavailable session API as an anonymous user', async () => {
  fetch.mockResolvedValue(jsonResponse({ error: 'Authentication service unavailable.' }, 503))
  render(<App />)

  expect((await screen.findByRole('alert')).textContent).toMatch(/authentication service unavailable/i)
  expect(screen.queryByRole('heading', { name: /welcome back/i })).toBeNull()
  expect(screen.getByRole('button', { name: /retry connection/i })).toBeTruthy()
})

test('keeps the operator console visible and reports a failed logout request', async () => {
  fetch.mockImplementation((url) => {
    if (url.endsWith('/auth/me')) return Promise.resolve(jsonResponse({ user: { email: 'ops@example.com' } }))
    if (url.endsWith('/health')) return Promise.resolve(jsonResponse({
      api: 'healthy',
      database: 'healthy',
      deployment: { configured: false },
    }))
    if (url.endsWith('/auth/logout')) return Promise.resolve(jsonResponse({ error: 'Unable to revoke session.' }, 503))
    throw new Error(`Unexpected request: ${url}`)
  })
  const user = userEvent.setup()
  render(<App />)

  await user.click(await screen.findByRole('button', { name: /sign out/i }))
  expect((await screen.findByRole('alert')).textContent).toMatch(/could not end your session/i)
  expect(screen.getByRole('heading', { name: /station console dashboard/i })).toBeTruthy()
})

test('operator preview actions change only sample run state', async () => {
  const user = userEvent.setup()
  fetch.mockImplementation((url) => {
    if (url.endsWith('/auth/me')) return Promise.resolve(jsonResponse({ user: { email: 'ops@example.com' } }))
    if (url.endsWith('/health')) return Promise.resolve(jsonResponse({ api: 'healthy', database: 'healthy' }))
    throw new Error(`Unexpected request: ${url}`)
  })
  render(<App />)

  await user.click(await screen.findByRole('button', { name: /start sample run/i }))
  expect(screen.getByRole('heading', { name: /running test sequence/i })).toBeTruthy()
  expect(screen.getByText('Step 2 of 3')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: /complete sample run/i }))
  expect(screen.getByRole('heading', { name: /all limits passed/i })).toBeTruthy()
  expect(screen.getByText('3 of 3 steps')).toBeTruthy()
  expect(screen.getByText(/station agent owns this decision/i)).toBeTruthy()
  await user.selectOptions(screen.getByLabelText(/preview sample state/i), 'fail')
  expect(screen.getByRole('heading', { name: /result outside limit/i })).toBeTruthy()
  await user.selectOptions(screen.getByLabelText(/preview sample state/i), 'error')
  expect(screen.getByRole('heading', { name: /safety interlock open/i })).toBeTruthy()
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/api/auth/me', '/api/health'])
})

test('supervisor preview supports selecting a sample station and local alert acknowledgement', async () => {
  const user = userEvent.setup()
  fetch.mockImplementation((url) => {
    if (url.endsWith('/auth/me')) return Promise.resolve(jsonResponse({ user: { email: 'ops@example.com' } }))
    if (url.endsWith('/health')) return Promise.resolve(jsonResponse({ api: 'healthy', database: 'healthy' }))
    throw new Error(`Unexpected request: ${url}`)
  })
  render(<App />)

  await user.click(await screen.findByRole('tab', { name: /supervisor line overview/i }))
  expect(screen.getByRole('region', { name: /supervisor line overview preview/i })).toBeTruthy()
  expect(screen.getByText(/cannot start or stop runs/i)).toBeTruthy()
  await user.click(screen.getByRole('button', { name: /sample station 07/i }))
  expect(screen.getByRole('heading', { name: /st-07.*voltage & continuity/i })).toBeTruthy()
  await user.click(screen.getAllByRole('button', { name: 'Ack' })[0])
  expect(screen.getAllByText(/acknowledged locally/i).length).toBeGreaterThan(0)
  expect(screen.getByText(/stay in this browser preview only/i)).toBeTruthy()
})

test('supervisor station grid supports roving arrow-key navigation and wraps by row', async () => {
  const user = userEvent.setup()
  fetch.mockImplementation((url) => {
    if (url.endsWith('/auth/me')) return Promise.resolve(jsonResponse({ user: { email: 'ops@example.com' } }))
    if (url.endsWith('/health')) return Promise.resolve(jsonResponse({ api: 'healthy', database: 'healthy' }))
    throw new Error(`Unexpected request: ${url}`)
  })
  render(<App />)
  await user.click(await screen.findByRole('tab', { name: /supervisor line overview/i }))

  const station = (number) => {
    const stationName = `Sample station ${String(number).padStart(2, '0')}`
    return screen.getAllByRole('button').find((tile) => tile.getAttribute('aria-label')?.startsWith(stationName))
  }
  await user.click(station(7))
  expect(document.activeElement).toBe(station(7))
  await user.keyboard('{ArrowRight}')
  expect(document.activeElement).toBe(station(8))
  expect(station(8).getAttribute('aria-pressed')).toBe('true')
  expect(station(7).getAttribute('tabindex')).toBe('-1')

  await user.keyboard('{ArrowDown}')
  expect(document.activeElement).toBe(station(18))
  await user.keyboard('{ArrowLeft}')
  expect(document.activeElement).toBe(station(17))
  await user.keyboard('{ArrowUp}')
  expect(document.activeElement).toBe(station(7))

  await user.click(station(1))
  await user.keyboard('{ArrowLeft}')
  expect(document.activeElement).toBe(station(10))
})
