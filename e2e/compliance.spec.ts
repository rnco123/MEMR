import { expect, test } from '@playwright/test'
import { signIn as adaptiveSignIn } from './helpers/sign-in'

const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL?.trim() || ''
const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD?.trim() || ''
const nurseEmail = process.env.PLAYWRIGHT_NURSE_EMAIL?.trim() || ''
const nursePassword = process.env.PLAYWRIGHT_NURSE_PASSWORD?.trim() || ''

function makeTestDoctor() {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  return {
    email: `compliance.doctor.${stamp}@example.com`,
    name: `Compliance Doctor ${stamp}`,
    password: `Playwright!Aa1${stamp}`,
  }
}

test.describe('Compliance Access', () => {
  test.setTimeout(300000)

  // ── Full flow: admin creates doctor with compliance → doctor sees compliance page ──
  test('admin creates doctor with compliance access and doctor can view compliance page', async ({ page }) => {
    if (!adminEmail || !adminPassword) {
      test.skip(true, 'Set PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD.')
      return
    }

    const doctor = makeTestDoctor()
    let createdUid: string | null = null

    try {
      // Step 1: Sign in as admin
      const adminJson = await adaptiveSignIn(page, adminEmail, adminPassword)
      expect(adminJson.role).toBe('admin')
      await page.waitForURL(/\/admin/, { timeout: 45000 })

      // Step 2: Go to admin users page
      await page.goto('/admin/users')
      await page.waitForLoadState('networkidle')

      // Step 3: Open Create User modal
      const createBtn = page.getByTestId('admin-users-create-button').or(
        page.getByRole('button', { name: /create account|create user/i })
      )
      await expect(createBtn).toBeVisible({ timeout: 20000 })
      await createBtn.click()

      const createModal = page.getByTestId('admin-users-create-modal').or(
        page.getByRole('heading', { name: /create user account/i }).locator('../..')
      ).first()
      await expect(createModal).toBeVisible({ timeout: 20000 })

      // Step 4: Select Doctor role (default is already doctor, but click to be explicit)
      const doctorRoleBtn = page.getByTestId('admin-create-user-role-doctor').or(
        page.getByRole('button', { name: /^doctor$/i })
      )
      await expect(doctorRoleBtn).toBeVisible({ timeout: 10000 })
      await doctorRoleBtn.click()
      await page.waitForTimeout(300)

      // Step 5: Tick "Compliance dashboard access" checkbox
      // This checkbox only appears when role is Doctor
      const complianceCheckbox = page.getByLabel(/compliance dashboard access/i)
      await expect(complianceCheckbox).toBeVisible({ timeout: 10000 })
      if (!(await complianceCheckbox.isChecked())) {
        await complianceCheckbox.check()
      }
      await expect(complianceCheckbox).toBeChecked()
      console.log('✓ Compliance access checkbox ticked')

      // Step 6: Fill name, email, password
      const nameInput = page.getByTestId('admin-users-name-input').or(
        page.getByPlaceholder(/full name|please enter user full name/i)
      )
      const emailInput = page.getByTestId('admin-users-email-input').or(
        page.getByPlaceholder(/email.*address|please enter user valid email/i)
      )
      const passwordInput = page.getByTestId('admin-users-password-input').or(
        page.getByPlaceholder(/min 8|password/i).first()
      )

      await nameInput.fill(doctor.name)
      await emailInput.fill(doctor.email)
      await passwordInput.fill(doctor.password)

      // Step 7: Submit
      const createResponsePromise = page.waitForResponse(
        r => /\/api\/admin\/users/.test(r.url()) && r.request().method() === 'POST',
        { timeout: 60000 }
      )
      const submitBtn = page.getByTestId('admin-users-submit-button').or(
        page.locator('form').getByRole('button', { name: 'Create Account' })
      )
      await submitBtn.click()

      const createResponse = await createResponsePromise
      expect(createResponse.ok(), `Doctor creation failed: ${createResponse.status()}`).toBeTruthy()
      const createJson = await createResponse.json() as { uid?: string }
      createdUid = createJson.uid ?? null
      console.log(`✓ Doctor created: ${doctor.email}`)

      // Step 8: Sign out as admin
      const signOutPromise = page.waitForResponse(
        r => r.url().endsWith('/api/auth/signout') && r.request().method() === 'POST'
      )
      await page.getByRole('button', { name: 'Sign Out' }).click()
      await signOutPromise
      await page.waitForURL(/\/(login)?$/, { timeout: 30000 })

      // Step 9: Sign in as the new doctor
      const doctorJson = await adaptiveSignIn(page, doctor.email, doctor.password)
      expect(['doctor', 'fnp', 'pa']).toContain(doctorJson.role)
      await page.waitForURL(/\/dashboard/, { timeout: 45000 })
      await page.waitForLoadState('networkidle')
      console.log('✓ Signed in as newly created doctor')

      // Step 10: Compliance link must be visible in sidebar
      const complianceLink = page.getByRole('link', { name: /^compliance$/i }).first()
      await expect(
        complianceLink,
        'Compliance link should appear in sidebar for doctor with compliance_access=true'
      ).toBeVisible({ timeout: 15000 })
      console.log('✓ Compliance link visible in doctor sidebar')

      // Step 11: Navigate to compliance page
      await complianceLink.click()
      await page.waitForLoadState('networkidle')
      await expect(page).toHaveURL(/\/dashboard\/compliance/, { timeout: 15000 })
      await expect(
        page.getByRole('heading', { name: /compliance/i }).first()
      ).toBeVisible({ timeout: 15000 })
      console.log('✓ Doctor compliance page loaded successfully')

    } finally {
      // Cleanup: delete test doctor so it doesn't pollute the database
      if (createdUid) {
        await page.request.delete('/api/admin/users', { data: { uid: createdUid } })
        console.log('✓ Test doctor deleted')
      }
    }
  })

  // ── Admin compliance dashboard ────────────────────────────────────────────────
  test('admin compliance dashboard loads', async ({ page }) => {
    if (!adminEmail || !adminPassword) {
      test.skip(true, 'Set admin credentials.')
      return
    }

    const json = await adaptiveSignIn(page, adminEmail, adminPassword)
    expect(json.role).toBe('admin')
    await page.waitForURL(/\/admin/, { timeout: 45000 })

    await page.goto('/admin/compliance')
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByRole('heading', { name: /compliance/i }).first().or(
        page.locator('[data-testid*="compliance"]').first()
      )
    ).toBeVisible({ timeout: 20000 })

    console.log('✓ Admin compliance dashboard loaded')
  })

  // ── Nurse cannot access compliance ───────────────────────────────────────────
  test('nurse cannot access compliance page', async ({ page }) => {
    if (!nurseEmail || !nursePassword) {
      test.skip(true, 'Set nurse credentials.')
      return
    }

    const json = await adaptiveSignIn(page, nurseEmail, nursePassword)
    expect(json.role).toBe('nurse')
    await page.waitForURL(/\/dashboard/, { timeout: 45000 })

    await page.goto(`${process.env.PLAYWRIGHT_BASE_URL}/dashboard/compliance`)
    await page.waitForLoadState('networkidle')

    await expect(page).not.toHaveURL(/\/compliance/, { timeout: 10000 })
    console.log('✓ Nurse correctly blocked from compliance page')
  })

  // ── Compliance not in nurse sidebar ──────────────────────────────────────────
  test('compliance link not visible in nurse sidebar', async ({ page }) => {
    if (!nurseEmail || !nursePassword) {
      test.skip(true, 'Set nurse credentials.')
      return
    }

    const json = await adaptiveSignIn(page, nurseEmail, nursePassword)
    expect(json.role).toBe('nurse')
    await page.waitForURL(/\/dashboard/, { timeout: 45000 })

    const complianceLink = page.getByRole('link', { name: /^compliance$/i })
    await expect(complianceLink).not.toBeVisible({ timeout: 5000 })
    console.log('✓ Compliance link hidden from nurse sidebar')
  })
})
