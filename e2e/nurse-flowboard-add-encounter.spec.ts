import { expect, test, type Page } from '@playwright/test'
import { signIn as adaptiveSignIn } from './helpers/sign-in'

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
  const json = await adaptiveSignIn(page, email, password)
  expect(json.role, 'Expected the authenticated account to resolve to nurse role').toBe('nurse')
  await page.waitForURL(/\/dashboard(?:\/)?/, { timeout: 45000 })
  await page.waitForFunction(
    () => !document.body.innerText.includes('Redirecting to dashboard'),
    { timeout: 15000 }
  ).catch(() => {})
  await page.waitForResponse(
    r => r.url().includes('/api/me/profile') && r.status() < 400,
    { timeout: 30000 }
  ).catch(() => {})
  await page.waitForLoadState('networkidle')
}

test.describe('nurse flowboard add encounter', () => {
  test.setTimeout(300000)

  test('nurse can add an encounter for an existing patient', async ({ page }) => {
    requireCredentials()

    await signInAsNurse(page, nurseEmail, nursePassword)

    await page.getByRole('link', { name: /virtual waiting room/i }).click()
    await page.waitForURL(/\/dashboard\/(nurse-)?flowboard/, { timeout: 30000 })

    // Add encounter button — testid on local, button text on deployed
    const addEncounterBtn = page.getByTestId('nurse-flowboard-add-encounter-button').or(
      page.getByRole('button', { name: /add encounter/i })
    )
    await expect(addEncounterBtn).toBeVisible({ timeout: 30000 })
    await page.waitForLoadState('networkidle')
    await expect(addEncounterBtn).toBeVisible({ timeout: 10000 })
    await addEncounterBtn.click()

    // Wait for modal to open — detect by testid or heading
    const modalByTestId = page.getByTestId('nurse-add-encounter-modal')
    const modalByHeading = page.getByRole('heading', { name: /add encounter for existing patient/i })
    const hasTestId = await modalByTestId.isVisible({ timeout: 5000 }).catch(() => false)
    if (!hasTestId) {
      await expect(modalByHeading).toBeVisible({ timeout: 30000 })
    }

    // Search input — appears after optionsLoading finishes
    const searchInput = page.locator('[data-testid="nurse-add-encounter-modal"] input, [role="dialog"] input').first()
    await expect(searchInput).toBeVisible({ timeout: 60000 })

    // Show all patients button
    const showAllButton = page.getByRole('button', { name: /show all patients/i })
    await expect(showAllButton).toBeVisible({ timeout: 30000 })

    const patientSearchPromise = page.waitForResponse(
      r => r.url().includes('/api/nurse/patient-search'),
      { timeout: 30000 }
    )
    await showAllButton.click()
    await patientSearchPromise

    // First patient button — testid pattern on local, any button in results on deployed
    const firstPatientButton = page.locator('[data-testid^="nurse-add-encounter-patient-"]').first().or(
      page.locator('[role="dialog"] button, [data-testid="nurse-add-encounter-modal"] button')
        .filter({ hasText: /\w+ \w+/ })
        .first()
    )
    await expect(firstPatientButton).toBeVisible({ timeout: 30000 })

    const createResponsePromise = page.waitForResponse(
      r => r.url().endsWith('/api/nurse/walk-in') && r.request().method() === 'POST',
      { timeout: 60000 }
    )
    await firstPatientButton.click()

    // Submit encounter button — testid on local, button text on deployed
    const submitEncounterBtn = page.getByTestId('nurse-add-encounter-submit-button').or(
      page.getByRole('button', { name: /create encounter|save encounter|submit/i })
    )
    await expect(submitEncounterBtn).toBeVisible({ timeout: 30000 })
    await submitEncounterBtn.click()

    const createResponse = await createResponsePromise
    expect(createResponse.ok(), `Encounter create failed with ${createResponse.status()}`).toBeTruthy()

    const createJson = (await createResponse.json()) as {
      data?: { encounter_id?: number; appointment_id?: number; patient_id?: number }
    }
    const encounterId = createJson.data?.encounter_id
    const appointmentId = createJson.data?.appointment_id
    const patientId = createJson.data?.patient_id

    expect(encounterId, 'Expected encounter id').toBeTruthy()
    expect(appointmentId, 'Expected appointment id').toBeTruthy()
    expect(patientId, 'Expected patient id').toBeTruthy()

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

    // Encounter detail confirmation
    await expect(page.getByText(/appointment initiated/i).first()).toBeVisible({ timeout: 30000 })
  })
})
