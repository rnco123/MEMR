import { expect, test, type Page } from '@playwright/test'
import { signIn } from './helpers/sign-in'

const DEPLOYED_URL = process.env.PLAYWRIGHT_BASE_URL!

const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL?.trim() || ''
const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD?.trim() || ''
const nurseEmail = process.env.PLAYWRIGHT_NURSE_EMAIL?.trim() || ''
const nursePassword = process.env.PLAYWRIGHT_NURSE_PASSWORD?.trim() || ''

function requireAdminCredentials() {
  if (!adminEmail || !adminPassword) {
    test.skip(true, 'Set PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD to run auth tests.')
  }
}

function requireNurseCredentials() {
  if (!nurseEmail || !nursePassword) {
    test.skip(true, 'Set PLAYWRIGHT_NURSE_EMAIL and PLAYWRIGHT_NURSE_PASSWORD to run auth tests.')
  }
}

async function goToLogin(page: Page) {
  await page.goto(`${DEPLOYED_URL}/login`)
  await page.waitForLoadState('networkidle')
}

test.describe('Authentication', () => {
  test.setTimeout(120000)

  // ── Login with valid credentials → correct dashboard ───────────────────────
  test('admin login lands on /admin dashboard', async ({ page }) => {
    requireAdminCredentials()
    const json = await signIn(page, adminEmail, adminPassword)
    expect(json.role).toBe('admin')
    await page.waitForURL(/\/admin(?:\/)?$/, { timeout: 45000 })
    await expect(page).toHaveURL(/\/admin/)
  })

  test('nurse login lands on /dashboard', async ({ page }) => {
    requireNurseCredentials()
    const json = await signIn(page, nurseEmail, nursePassword)
    expect(json.role).toBe('nurse')
    await page.waitForURL(/\/dashboard/, { timeout: 45000 })
    await expect(page).toHaveURL(/\/dashboard/)
  })

  // ── Login with invalid email format → validation shown ──────────────────────
  test('invalid email format shows validation error', async ({ page }) => {
    await goToLogin(page)
    // Fill invalid email and try to submit
    await page.getByPlaceholder('name@example.com').last().fill('not-an-email')
    await page.getByPlaceholder('Enter your password').last().fill('somepassword')
    await page.getByRole('button', { name: 'Sign In Now' }).last().click()
    // Should show validation — either native browser validation or custom error
    // The form should NOT navigate away
    await page.waitForTimeout(1000)
    await expect(page).toHaveURL(/\/login/)
  })

  // ── Login with wrong password → error message ──────────────────────────────
  test('wrong password shows error message', async ({ page }) => {
    requireAdminCredentials()
    await goToLogin(page)
    await page.getByPlaceholder('name@example.com').last().fill(adminEmail)
    await page.getByPlaceholder('Enter your password').last().fill('WrongPassword123!')

    const loginResponsePromise = page.waitForResponse(
      r => r.url().includes('/api/auth/login') && r.request().method() === 'POST'
    )
    await page.getByRole('button', { name: 'Sign In Now' }).last().click()
    const loginResponse = await loginResponsePromise

    // Should return 401 or error
    expect(loginResponse.status()).not.toBe(200)
    // Should stay on login page
    await expect(page).toHaveURL(/\/login/)
  })

  // ── Sign out → session cleared, redirected to /login ───────────────────────
  test('sign out clears session and redirects to login', async ({ page }) => {
    requireAdminCredentials()
    await signIn(page, adminEmail, adminPassword)
    await page.waitForURL(/\/admin/, { timeout: 45000 })

    const signOutResponsePromise = page.waitForResponse(
      r => r.url().includes('/api/auth/signout') && r.request().method() === 'POST'
    )
    await page.getByRole('button', { name: 'Sign Out' }).click()
    const signOutResponse = await signOutResponsePromise
    expect(signOutResponse.ok()).toBeTruthy()

    await page.waitForURL(/\/(login)?$/, { timeout: 30000 })
    await expect(page).toHaveURL(/\/(login)?$/)
  })

  // ── Session persistence on refresh ─────────────────────────────────────────
  test('session persists after page refresh', async ({ page }) => {
    requireNurseCredentials()
    await signIn(page, nurseEmail, nursePassword)
    await page.waitForURL(/\/dashboard/, { timeout: 45000 })

    // Refresh the page
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Should still be on dashboard, not redirected to login
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page).not.toHaveURL(/\/login/)
  })

  // ── Route protection: logged-out user opens protected page ─────────────────
  test('logged-out user accessing protected page redirects to login', async ({ page }) => {
    // Go directly to dashboard without logging in
    await page.goto(`${DEPLOYED_URL}/dashboard`)
    await page.waitForLoadState('networkidle')
    // Should be redirected — middleware sends to / with redirectedFrom param or /login
    await expect(page).toHaveURL(/\/login|redirectedFrom/, { timeout: 15000 })
  })

  // ── Route protection: non-admin opens /admin ────────────────────────────────
  test('nurse accessing /admin is redirected or denied', async ({ page }) => {
    requireNurseCredentials()
    await signIn(page, nurseEmail, nursePassword)
    await page.waitForURL(/\/dashboard/, { timeout: 45000 })

    // Try to navigate to admin
    await page.goto(`${DEPLOYED_URL}/admin`)
    await page.waitForLoadState('networkidle')

    // Should be redirected away from /admin
    const currentUrl = page.url()
    expect(currentUrl).not.toMatch(/\/admin$/)
  })
})
