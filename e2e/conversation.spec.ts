import { test, expect } from '@playwright/test'

/**
 * E2E: Conversation thread UI — Praxio Conversations page.
 *
 * These tests run against the Vite dev server (http://localhost:5173).
 * The Conversations page lives at /:companyPrefix/conversations in the router,
 * but for Praxio UI dev/demo purposes the mock agents are always present once
 * the app is running with a valid company prefix.
 *
 * NOTE: These tests require a running Paperclip backend so that CloudAccessGate
 * can resolve the health check and company context. In CI, the webServer directive
 * in playwright.config.ts starts `cd ui && pnpm dev` which proxies /api to :3100.
 * Run `pnpm dev` (full stack) before running these tests locally.
 *
 * Route under test: /:companyPrefix/conversations
 * To navigate there in tests, we hit /conversations which the router redirects
 * through UnprefixedBoardRedirect → /:companyPrefix/conversations.
 */

test.describe('Conversation', () => {
  test('user can send a message and see it in the thread', async ({ page }) => {
    await page.goto('/conversations')

    // Rosalind is selected by default (first agent, status: live)
    await expect(page.getByText('Rosalind')).toBeVisible()

    // Type and send a message
    const input = page.getByRole('textbox')
    await input.fill('Hello Rosalind')
    await input.press('Enter')

    // Message appears in thread
    await expect(page.getByText('Hello Rosalind')).toBeVisible()
  })

  test('user can switch between agents', async ({ page }) => {
    await page.goto('/conversations')

    // Type a message for Rosalind
    await page.getByRole('textbox').fill('Message for Rosalind')
    await page.getByRole('textbox').press('Enter')
    await expect(page.getByText('Message for Rosalind')).toBeVisible()

    // Switch to Engineering — agents are rendered as buttons in AgentSidebar
    await page.getByRole('button', { name: /Engineering/ }).click()

    // Rosalind's message is not in Engineering's thread
    await expect(page.getByText('Message for Rosalind')).not.toBeVisible()
  })

  test('agent sidebar shows all four agents', async ({ page }) => {
    await page.goto('/conversations')

    // All four mock agents should appear in the sidebar
    await expect(page.getByText('Rosalind')).toBeVisible()
    await expect(page.getByText('Engineering')).toBeVisible()
    await expect(page.getByText('Marketing')).toBeVisible()
    await expect(page.getByText('Agent Ops')).toBeVisible()
  })
})
