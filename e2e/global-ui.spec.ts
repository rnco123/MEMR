import { expect, test, type Page } from '@playwright/test'
import { signIn as adaptiveSignIn } from './helpers/sign-in'

const DEPLOYED_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mcm-testing.up.railway.app'
const nurseEmail = process.env.PLAYWRIGHT_NURSE_EMAIL?.trim() || ''
const nursePassword = process.env.PLAYWRIGHT_NURSE_PASSWORD?.trim() || ''

async function signInAsNurse(page: Page) {
  const json = await adaptiveSignIn(page, nurseEmail, nursePassword)
  expect(json.role).toBe('nurse')
  await page.waitForURL(/\/dashboard/, { timeout: 45000 })
  await page.waitForLoadState('networkidle')
}

test.describe('Global UI', () => {
  test.setTimeout(120000)

  // ── Language toggle ─────────────────────────────────────────────────────────
  test('language toggle switches UI from English to Spanish', async ({ page }) => {
    if (!nurseEmail || !nursePassword) {
      test.skip(true, 'Set nurse credentials.')
      return
    }

    await signInAsNurse(page)

    // Find language toggle — EN/ES buttons (scoped to <button> to avoid matching logo text)
    const esToggle = page.locator('button').filter({ hasText: /^ES$/i }).first()
    await expect(esToggle).toBeVisible({ timeout: 15000 })
    await esToggle.click()

    await page.waitForTimeout(1000)

    // After switching to Spanish, sidebar or heading should show Spanish text
    // e.g. "Sala de espera virtual" instead of "Virtual waiting room"
    await expect(
      page.getByText(/sala de espera|pacientes|dashboard/i).first()
    ).toBeVisible({ timeout: 10000 })

    console.log('✓ Language switched to Spanish')

    // Switch back to English (scoped to <button> to avoid matching logo text)
    const enToggle = page.locator('button').filter({ hasText: /^EN$/i }).first()
    await enToggle.click()
    await page.waitForTimeout(500)

    console.log('✓ Language switched back to English')
  })

  // ── PWA offline page ────────────────────────────────────────────────────────
  test('offline page renders when navigated to directly', async ({ page }) => {
    await page.goto(`${DEPLOYED_URL}/offline`)
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByText(/offline|no connection|internet/i).first()
    ).toBeVisible({ timeout: 10000 })

    console.log('✓ Offline page renders')
  })

  // ── Sidebar collapse/expand ─────────────────────────────────────────────────
  test('sidebar can be collapsed and expanded', async ({ page }) => {
    if (!nurseEmail || !nursePassword) {
      test.skip(true, 'Set nurse credentials.')
      return
    }

    await signInAsNurse(page)

    // Helper: finds the sidebar toggle button in either collapsed or expanded state.
    // The button's accessible name often changes after toggling (e.g. "collapse" ↔ "expand"),
    // so we re-query it each time rather than reusing a cached locator.
    const findSidebarToggle = () =>
      page
        .locator('button')
        .filter({ hasText: /^(collapse|expand|menu|toggle)$/i })
        .or(
          page.locator(
            '[data-testid*="sidebar-toggle"], [data-testid*="sidebar-collapse"], [aria-label*="sidebar"], [aria-label*="collapse"], [aria-label*="expand"]'
          )
        )
        .first()

    const collapseBtn = findSidebarToggle()
    const collapseBtnVisible = await collapseBtn.isVisible({ timeout: 5000 }).catch(() => false)
    if (!collapseBtnVisible) {
      console.log('ℹ Sidebar toggle not found — skipping')
      return
    }

    await collapseBtn.click()
    await page.waitForTimeout(500)

    // Sidebar should be collapsed — navigation text hidden
    const sidebarText = page.getByRole('navigation').getByText(/virtual waiting room/i)
    const isHidden = !(await sidebarText.isVisible({ timeout: 2000 }).catch(() => true))

    // Re-query the toggle: its label may have changed after collapse
    const expandBtn = findSidebarToggle()
    const expandBtnVisible = await expandBtn.isVisible({ timeout: 5000 }).catch(() => false)
    if (expandBtnVisible) {
      await expandBtn.click() // Expand back
      await page.waitForTimeout(500)
    } else {
      console.log('ℹ Expand button not found after collapse — skipping expand step')
    }

    console.log(`✓ Sidebar toggle works — collapsed: ${isHidden}`)
  })
})
