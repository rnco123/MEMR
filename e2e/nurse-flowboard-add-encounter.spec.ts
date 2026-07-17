import { expect, test, type Page } from '@playwright/test'

const nurseEmail = process.env.PLAYWRIGHT_NURSE_EMAIL?.trim() || ''
const nursePassword = process.env.PLAYWRIGHT_NURSE_PASSWORD?.trim() || ''

function requireCredentials() {
  if (!nurseEmail || !nursePassword) {
    test.skip(
      true,
      'Set PLAYWRIGHT_NURSE_EMAIL and PLAYWRIGHT_NURSE_PASSWORD before running the nurse e2e test.'
    )
  }
}

async function signInAsNurse(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  const loginForm = page.getByTestId('login-form').nth(1)
  await loginForm.getByTestId('login-email-input').fill(email)
  await loginForm.getByTestId('login-password-input').fill(password)
  const responsePromise = page.waitForResponse(
    response => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST'
  )
  await loginForm.getByTestId('login-submit-button').click()
  const response = await responsePromise
  expect(response.ok(), `Login failed with ${response.status()}`).toBeTruthy()
  const json = (await response.json()) as { role?: string | null }
  expect(json.role, 'Expected the authenticated account to resolve to nurse role').toBe('nurse')
  // Wait for the post-login delayed redirect to land on /dashboard
  await page.waitForURL(/\/dashboard(?:\/)?/, { timeout: 45000 })
  // Wait for the redirect animation to finish
  await page.waitForFunction(
    () => !document.body.innerText.includes('Redirecting to dashboard'),
    { timeout: 15000 }
  ).catch(() => {})
  // Wait for /api/me/profile to complete — this warms the profile cache so the
  // next page load resolves role fast enough for withRoleProtection to pass
  await page.waitForResponse(
    r => r.url().includes('/api/me/profile') && r.status() < 400,
    { timeout: 30000 }
  ).catch(() => {})
  await page.waitForLoadState('networkidle')
}

test.describe('nurse flowboard add encounter', () => {
  test.setTimeout(300000) // 5 minutes

  test('nurse can add an encounter for an existing patient', async ({ page }) => {
    requireCredentials()

    await signInAsNurse(page, nurseEmail, nursePassword)

    // Click the "Virtual waiting room" sidebar link for client-side navigation.
    // This keeps React mounted so role stays confirmed through the navigation.
    await page.getByRole('link', { name: /virtual waiting room/i }).click()
    // The link goes to /dashboard/flowboard which redirects nurses to /dashboard/nurse-flowboard
    await page.waitForURL(/\/dashboard\/(nurse-)?flowboard/, { timeout: 30000 })

    await expect(page.getByTestId('nurse-flowboard-add-encounter-button')).toBeVisible({
      timeout: 30000,
    })

    // Wait for the appointments fetch to settle
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('nurse-flowboard-add-encounter-button')).toBeVisible({
      timeout: 10000,
    })
    await page.getByTestId('nurse-flowboard-add-encounter-button').click()
    const modal = page.getByTestId('nurse-add-encounter-modal')
    await expect(modal).toBeVisible({ timeout: 30000 })

    // The modal fetches services/pharmacies on open (optionsLoading).
    // Wait for the search input to appear — it's only rendered when optionsLoading=false.
    // This fetch can be slow; give it up to 60s.
    const searchInput = modal.locator('input').first()
    await expect(searchInput).toBeVisible({ timeout: 60000 })

    // Now wait for show-all button and click it.
    // Button text is "Show all patients in my location"
    const showAllButton = modal.getByRole('button', { name: /show all patients/i })
    await expect(showAllButton).toBeVisible({ timeout: 30000 })

    // Intercept the patient-search response before clicking
    const patientSearchPromise = page.waitForResponse(
      response => response.url().includes('/api/nurse/patient-search'),
      { timeout: 30000 }
    )
    await showAllButton.click()
    await patientSearchPromise

    const patientButtons = modal.locator('[data-testid^="nurse-add-encounter-patient-"]')
    const firstPatientButton = patientButtons.first()
    await expect(firstPatientButton).toBeVisible({ timeout: 30000 })

    const createResponsePromise = page.waitForResponse(
      response =>
        response.url().endsWith('/api/nurse/walk-in') && response.request().method() === 'POST'
    )
    await firstPatientButton.click()
    await expect(modal.getByTestId('nurse-add-encounter-submit-button')).toBeVisible({
      timeout: 30000,
    })
    await modal.getByTestId('nurse-add-encounter-submit-button').click()

    const createResponse = await createResponsePromise
    expect(
      createResponse.ok(),
      `Encounter create failed with ${createResponse.status()}`
    ).toBeTruthy()

    const createJson = (await createResponse.json()) as {
      data?: {
        encounter_id?: number
        appointment_id?: number
        patient_id?: number
      }
    }
    const encounterId = createJson.data?.encounter_id
    const appointmentId = createJson.data?.appointment_id
    const patientId = createJson.data?.patient_id

    expect(encounterId, 'Expected walk-in create to return an encounter id').toBeTruthy()
    expect(appointmentId, 'Expected walk-in create to return an appointment id').toBeTruthy()
    expect(patientId, 'Expected walk-in create to return a patient id').toBeTruthy()

    const detailJson = await page.evaluate(async (id) => {
      const res = await fetch(`/api/encounters/${id}/detail`, { credentials: 'include' })
      if (!res.ok) throw new Error(`Encounter detail failed with ${res.status}`)
      return res.json()
    }, encounterId) as {
      encounter?: { id?: number; status?: string }
      appointment?: { id?: number }
      patient?: { id?: number }
    }

    expect(detailJson.encounter?.id).toBe(encounterId)
    expect(detailJson.appointment?.id).toBe(appointmentId)
    expect(detailJson.patient?.id).toBe(patientId)
    expect(detailJson.encounter?.status).toBe('appointment_initiated')

    await expect(page.getByTestId('encounter-detail-modal')).toBeVisible({ timeout: 30000 })
    await expect(page.getByTestId('encounter-detail-modal')).toContainText(
      'Appointment Initiated',
      {
        timeout: 30000,
      }
    )
  })
})
