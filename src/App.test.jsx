import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test } from 'vitest'
import App from './App'

afterEach(cleanup)

test('renders the heading', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: /get started/i })).toBeTruthy()
})

test('counter increments on click', async () => {
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: /count is 0/i }))
  expect(screen.getByRole('button', { name: /count is 1/i })).toBeTruthy()
})
