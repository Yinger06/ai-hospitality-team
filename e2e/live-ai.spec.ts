import { expect, test } from '@playwright/test'

test('runs a guest message through the live Manyfold model runtime', async ({ page }) => {
  test.skip(process.env.RUN_LIVE_AI !== 'true', 'Set RUN_LIVE_AI=true to consume live model quota.')
  test.setTimeout(120_000)

  await page.goto('/')
  await page.getByPlaceholder('Write as the guest…').fill(
    'The room feels wonderfully calm, and we are enjoying a quiet cup of tea tonight.',
  )
  await page.getByRole('button', { name: 'Send guest message' }).click()

  await expect(page.getByText('Manyfold live AI')).toBeVisible({ timeout: 100_000 })
  await expect(page.getByText('AI run stopped safely')).toHaveCount(0)
  await expect(page.locator('.message-host .message-bubble').last()).not.toContainText(
    'can’t safely complete that request',
  )
  await expect(page.locator('.model-trace-list')).toContainText('gpt-5.4-mini')

  await page.screenshot({ path: '/tmp/ai-hospitality-team-live-ai.png', fullPage: true })
})
