import { test, expect } from '@playwright/test'

/**
 * E2E: Right Panel — agent details, playbook, and grading.
 *
 * These tests validate what is actually rendered in the RightPanel component
 * on the Conversations page.
 *
 * Important: The grading panel (SessionGrading) is conditionally rendered only
 * when a `conversationId` prop is passed to RightPanel. In the current
 * Conversations.tsx implementation:
 *
 *   rightPanel={<RightPanel agent={selectedAgent} />}
 *
 * No conversationId is passed, so SessionGrading does NOT render. These tests
 * cover what IS rendered: agent details section and PlaybookPanel.
 *
 * Route under test: /:companyPrefix/conversations (navigated via /conversations)
 */

test.describe('Right Panel', () => {
  test('right panel shows agent details when agent is selected', async ({ page }) => {
    await page.goto('/conversations')

    // Rosalind is selected by default; her role is "Chief of Staff"
    // RightPanel renders: agent.name in a <p class="font-semibold"> and
    // agent.role in a <p class="text-sm text-muted-foreground">
    await expect(page.getByText('Chief of Staff')).toBeVisible()
  })

  test('right panel shows playbook empty state when no SKILL.md exists for mock agent', async ({ page }) => {
    await page.goto('/conversations')

    // The "Playbook" section header is always rendered when an agent is selected
    await expect(page.getByText('Playbook')).toBeVisible()

    // Mock agents use numeric IDs (1, 2, 3, 4). The /api/playbook/:id endpoint
    // returns a non-OK response for these IDs, so playbookContent is null.
    // PlaybookPanel renders its empty state: "No playbook linked."
    await expect(page.getByText(/No playbook linked/)).toBeVisible()
  })
})
