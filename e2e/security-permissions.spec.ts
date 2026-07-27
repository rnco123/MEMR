import { expect, test } from '@playwright/test'
import { signIn } from './helpers/sign-in'

const DEPLOYED_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mcm-testing.up.railway.app'

const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL?.trim() || ''
const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD?.trim() || ''
const nurseEmail = process.env.PLAYWRIGHT_NURSE_EMAIL?.trim() || ''
const nursePassword = process.env.PLAYWRIGHT_NURSE_PASSWORD?.trim() || ''

function requireAdminCredentials() {
  if (!adminEmail || !adminPassword) {
    test.skip(true, 'Set PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD.')
  }
}

function requireNurseCredentials() {
  if (!nurseEmail || !nursePassword) {
    test.skip(true, 'Set PLAYWRIGHT_NURSE_EMAIL and PLAYWRIGHT_NURSE_PASSWORD.')
  }
}

test.describe('Security & Permissions', () => {
  test.setTimeout(120000)

  // ── Non-admin blocked from /admin pages ─────────────────────────────────────
  test('non-admin user cannot access /admin', async ({ page }) => {
    requireNurseCredentials()
    await signIn(page, nurseEmail, nursePassword)
    await page.waitForURL(/\/dashboard/, { timeout: 45000 })

    await page.goto(`${DEPLOYED_URL}/admin`)
    await page.waitForLoadState('networkidle')

    // Must not be on /admin
    expect(page.url()).not.toMatch(/\/admin$/)
  })

  // ── Non-admin blocked from /admin API ───────────────────────────────────────
  test('nurse API call to admin endpoint returns 401 or 403', async ({ page }) => {
    requireNurseCredentials()
    await signIn(page, nurseEmail, nursePassword)
    await page.waitForURL(/\/dashboard/, { timeout: 45000 })

    // Try to call admin-only API
    const response = await page.request.get(`${DEPLOYED_URL}/api/admin/users`)
    expect([401, 403]).toContain(response.status())
  })

  // ── Nurse cannot create prescriptions via API ────────────────────────────────
  test('nurse cannot create prescription via API', async ({ page }) => {
    requireNurseCredentials()
    await signIn(page, nurseEmail, nursePassword)
    await page.waitForURL(/\/dashboard/, { timeout: 45000 })

    // Try to POST to prescriptions API
    const response = await page.request.post(`${DEPLOYED_URL}/api/prescriptions`, {
      data: {
        encounter_id: 1,
        medication: 'Test',
        dosage: '10mg',
      },
    })
    // Should be forbidden
    expect([401, 403]).toContain(response.status())
  })

  // ── Logged-out user cannot access any protected API ─────────────────────────
  test('unauthenticated request to protected API returns 401', async ({ request }) => {
    const response = await request.get(`${DEPLOYED_URL}/api/me/profile`)
    expect([401, 403]).toContain(response.status())
  })

  // ── Admin cannot deactivate themselves ──────────────────────────────────────
  test('admin cannot deactivate their own account', async ({ page }) => {
    requireAdminCredentials()
    await signIn(page, adminEmail, adminPassword)
    await page.waitForURL(/\/admin/, { timeout: 45000 })

    // Get own profile to find uid
    const profileResponse = await page.request.get(`${DEPLOYED_URL}/api/me/profile`)
    expect(profileResponse.ok()).toBeTruthy()
    const profile = await profileResponse.json() as { uid?: string }
    const uid = profile.uid

    if (!uid) {
      console.log('ℹ Could not get own uid — skipping self-deactivation check')
      return
    }

    // Try to deactivate self
    const deactivateResponse = await page.request.patch(`${DEPLOYED_URL}/api/admin/users`, {
      data: { uid, active: false },
    })
    // Should be rejected
    expect([400, 403]).toContain(deactivateResponse.status())
  })
})
