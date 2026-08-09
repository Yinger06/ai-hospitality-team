import { expect, test } from '@playwright/test'

test('shows selective multi-agent work, memory, escalation, and one guest response', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('AI Hospitality Team')).toBeVisible()
  await expect(page.getByText('Automatic welcome')).toBeVisible()

  await page.getByRole('button', { name: /Multi-intent moment/ }).click()
  await page.waitForTimeout(520)

  await expect(page.getByText('Team is coordinating')).toBeVisible()
  expect(await page.locator('.agent-working').count()).toBeGreaterThanOrEqual(4)
  await expect(page.locator('.live-indicator')).toContainText('Live')

  await expect(page.getByText('One response synthesised')).toBeVisible()
  await expect(page.locator('.trace-title')).toContainText('4 intents')
  await expect(page.locator('.agent-card').filter({ hasText: 'Front Desk' })).toContainText('Skipped')
  await expect(page.locator('.memory-list')).toContainText('British Museum')
  await expect(page.locator('.memory-list')).toContainText('Greenwich')
  await expect(page.locator('.escalation-card')).toContainText('Human host notified')
  await expect(page.locator('.message-host .message-bubble').last()).toContainText('British Museum')
  await expect(page.locator('.message-host .message-bubble').last()).toContainText('shower')
  await expect(page.locator('.message-host .message-bubble').last()).toContainText('Greenwich')

  await page.screenshot({ path: '/tmp/ai-hospitality-team-multi-agent.png' })
})

test('keeps the mobile workspace within the viewport and exposes navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)

  await page.getByRole('button', { name: 'Open navigation' }).click()
  await expect(page.locator('.sidebar')).toHaveClass(/sidebar-open/)
  await expect(page.getByText('Guest journey')).toBeVisible()
  await page.getByRole('button', { name: 'Close navigation' }).click()
  await expect(page.locator('.sidebar')).not.toHaveClass(/sidebar-open/)
})
