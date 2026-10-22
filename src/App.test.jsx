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

test('registration authenticates and displays live deployment health', async () => {
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

  expect(await screen.findByRole('heading', { name: /all systems operational/i })).toBeTruthy()
  expect(screen.getByText('2.4.0')).toBeTruthy()
  expect(screen.getByText('abc1234')).toBeTruthy()
  expect(screen.getByText('MySQL database')).toBeTruthy()
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

test('successful login restores the dashboard', async () => {
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
  expect(await screen.findByRole('heading', { name: /attention needed/i })).toBeTruthy()
  expect(screen.getByText('Unavailable')).toBeTruthy()
  expect(fetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST' }))
})

test('reports failed health checks as unknown instead of leaving services in checking state', async () => {
  fetch.mockImplementation((url) => {
    if (url.endsWith('/auth/me')) return Promise.resolve(jsonResponse({ user: { email: 'ops@example.com' } }))
    if (url.endsWith('/health')) return Promise.resolve(jsonResponse({ error: 'Health service unavailable.' }, 503))
    throw new Error(`Unexpected request: ${url}`)
  })
  render(<App />)

  expect(await screen.findByRole('heading', { name: /status check failed/i })).toBeTruthy()
  expect(screen.getAllByText('Unknown')).toHaveLength(3)
  expect(screen.getByText(/health signal unavailable/i)).toBeTruthy()
  expect(screen.getByRole('alert').textContent).toMatch(/health service unavailable/i)
})

test('does not treat an unavailable session API as an anonymous user', async () => {
  fetch.mockResolvedValue(jsonResponse({ error: 'Authentication service unavailable.' }, 503))
  render(<App />)

  expect((await screen.findByRole('alert')).textContent).toMatch(/authentication service unavailable/i)
  expect(screen.queryByRole('heading', { name: /welcome back/i })).toBeNull()
  expect(screen.getByRole('button', { name: /retry connection/i })).toBeTruthy()
})

test('keeps the dashboard visible and reports a failed logout request', async () => {
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
  expect(screen.getByRole('heading', { name: /all systems operational/i })).toBeTruthy()
})
