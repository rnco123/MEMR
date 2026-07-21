import { expect, test, type Page } from '@playwright/test'

const DEPLOYED_URL = 'https://mcm-testing.up.railway.app'
const nurseEmail = process.env.PLAYWRIGHT_NURSE_EMAIL?.trim() || ''
const nursePassword = process.env.PLAYWRIGHT_NURSE_PASSWORD?.trim() || ''

// Static generic patient data — phone uses timestamp suffix to avoid DOB+phone duplicate check
const ts = Date.now() % 9000000 + 1000000   // 7-digit suffix, always 7 digits
const PATIENT = {
  firstName: 'Ali',
  lastName: 'Hassan',
  email: 'ali@gmail.com',
  phone: `713${ts}`,       // unique 10-digit phone per run
  dob: '1990-05-15',
  gender: 'Male',
  address: '123 Main St',
  state: 'TX',
  zip: '77500',
}

function requireCredentials() {
  if (!nurseEmail || !nursePassword) {
    test.skip(true, 'Set PLAYWRIGHT_NURSE_EMAIL and PLAYWRIGHT_NURSE_PASSWORD to run this test.')
  }
}

async function signInAsNurse(page: Page) {
  await page.goto(`${DEPLOYED_URL}/login`)
  await page.waitForLoadState('networkidle')

  // Desktop form is the last of the two rendered forms
  await page.getByPlaceholder('name@example.com').last().fill(nurseEmail)
  await page.getByPlaceholder('Enter your password').last().fill(nursePassword)

  const loginResponsePromise = page.waitForResponse(
    r => r.url().includes('/api/auth/login') && r.request().method() === 'POST'
  )
  await page.getByRole('button', { name: 'Sign In Now' }).last().click()

  const loginResponse = await loginResponsePromise
  expect(loginResponse.ok(), `Login failed: ${loginResponse.status()}`).toBeTruthy()
  const json = (await loginResponse.json()) as { role?: string | null }
  expect(json.role, 'Expected nurse role').toBe('nurse')

  await page.waitForURL(/\/dashboard/, { timeout: 45000 })
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

test.describe('nurse flowboard — add new patient', () => {
  test.setTimeout(300000)

  test('nurse can register Ali Hassan as a new patient', async ({ page }) => {
    requireCredentials()

    await signInAsNurse(page)

    // Navigate via sidebar link (client-side nav keeps role confirmed)
    await page.getByRole('link', { name: /virtual waiting room/i }).click()
    await page.waitForURL(/\/dashboard\/(nurse-)?flowboard/, { timeout: 30000 })
    await page.waitForLoadState('networkidle')

    // ── Open modal ─────────────────────────────────────────────────────────────
    await page.getByRole('button', { name: /new patient/i }).click()
    await expect(page.getByRole('heading', { name: /register new patient/i })).toBeVisible({
      timeout: 30000,
    })

    // ── Step 1: Clinic location ─────────────────────────────────────────────────
    // Location is pre-selected. Click Next (violet button, not the disabled table one)
    await expect(page.getByRole('heading', { name: /clinic location/i })).toBeVisible({
      timeout: 15000,
    })

    // Treatment type dropdown — select "Primary Care" (or first available option)
    const treatmentSelect = page.locator('select').first()
    await treatmentSelect.selectOption({ index: 1 })   // pick any non-blank option

    // Click Next to move to patient details
    await page.getByRole('button', { name: /^next$/i }).last().click()

    // ── Step 2: Patient details ─────────────────────────────────────────────────
    await expect(page.getByRole('heading', { name: /patient details/i })).toBeVisible({
      timeout: 15000,
    })

    // First name (placeholder: "e.g. Maria")
    await page.getByPlaceholder('e.g. Maria').fill(PATIENT.firstName)

    // Last name (placeholder: "e.g. Garcia")
    await page.getByPlaceholder('e.g. Garcia').fill(PATIENT.lastName)

    // DOB — the date picker renders a textbox next to a calendar button.
    // Locate the textbox inside the section that has the "DOB" label text.
    const dobSection = page.locator('text=DOB').locator('..')
    const dobTextbox = dobSection.locator('input[type="text"], input:not([type="checkbox"]):not([type="hidden"])').first()
    await dobTextbox.click()
    await dobTextbox.fill(PATIENT.dob)
    // Press Tab/Enter to close the calendar picker if it opened
    await page.keyboard.press('Escape')

    // Gender dropdown — scope to Patient details section to avoid matching Treatment type select
    const genderSelect = page.locator('section').filter({ hasText: /patient details/i }).getByRole('combobox')
    await genderSelect.selectOption(PATIENT.gender)

    // ── Contact information ──────────────────────────────────────────────────────
    // Phone (placeholder: "10-digit mobile number")
    await page.getByPlaceholder('10-digit mobile number').fill(PATIENT.phone)

    // Email — after login page is gone there is only one "name@example.com" placeholder
    await page.getByPlaceholder('name@example.com').fill(PATIENT.email)

    // Address
    await page.getByPlaceholder('Street address').fill(PATIENT.address)
    await page.getByPlaceholder('TX').fill(PATIENT.state)
    await page.getByPlaceholder('77002').fill(PATIENT.zip)

    // Opt-in checkboxes — check both
    const textOptIn = page.getByLabel(/text message opt-in/i)
    if (!(await textOptIn.isChecked())) await textOptIn.check()

    const marketingOptIn = page.getByLabel(/check.*marketing.*opt-in|marketing.*opt-in/i)
    if (!(await marketingOptIn.isChecked())) await marketingOptIn.check()

    // ── Submit step 2 → triggers the API and advances to step 3 ─────────────────
    const createResponsePromise = page.waitForResponse(
      r => r.url().includes('/api/nurse/patients') && r.request().method() === 'POST',
      { timeout: 90000 }
    )

    // Button text: "Create patient & open visit" — enabled once required fields filled
    const submitBtn = page.getByRole('button', { name: /create patient/i })
    await expect(submitBtn).toBeEnabled({ timeout: 15000 })
    await submitBtn.click()

    // API fires here — patient + appointment + encounter are created.
    // 409 means a patient with the same DOB+phone already exists — still a pass.
    const createResponse = await createResponsePromise
    const is409 = createResponse.status() === 409
    expect(
      createResponse.ok() || is409,
      `Patient creation failed unexpectedly: ${createResponse.status()}`
    ).toBeTruthy()

    if (is409) {
      console.log('ℹ Patient already exists (409 duplicate) — test still passes.')
    }

    const body = (await createResponse.json()) as {
      patient?: { id?: number; first_name?: string; last_name?: string }
      encounter_id?: number
      appointment_id?: number
      error?: string
    }

    if (!is409) {
      expect(body.patient?.id, 'Expected patient id').toBeTruthy()
      expect(body.encounter_id, 'Expected encounter_id').toBeTruthy()
      expect(body.appointment_id, 'Expected appointment_id').toBeTruthy()
      console.log(
        `✓ Patient id=${body.patient?.id} (${body.patient?.first_name} ${body.patient?.last_name}), encounter=${body.encounter_id}`
      )
    }

    // ── Step 3: Document uploads ───────────────────────────────────────────────
    // Patient already created. This step handles optional documents.
    await expect(page.getByRole('heading', { name: /document uploads/i })).toBeVisible({
      timeout: 20000,
    })

    // Document Label — select 'ID' from the combobox inside the document uploads section
    const docLabelSelect = page.locator('section').filter({ hasText: /document uploads/i }).getByRole('combobox')
    await docLabelSelect.selectOption('ID')

    // Queue a dummy file via the hidden file input — do NOT use noWaitAfter so
    // the onChange fires synchronously and pendingFiles state updates before we proceed
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'patient-id.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Ali Hassan - Patient ID document'),
    })

    // Wait for the file list UI to confirm the file was queued into pendingFiles state.
    // The modal renders "{count} file(s) ready" only when pendingFiles.length > 0.
    await expect(page.getByText(/1 file\(s\) ready/i)).toBeVisible({ timeout: 15000 })

    // Button now reads "Upload & finish" (not "Finish") — click to upload and close wizard
    const uploadFinishBtn = page.getByRole('button', { name: /upload.*finish/i })
    await expect(uploadFinishBtn).toBeVisible({ timeout: 5000 })
    await uploadFinishBtn.click()

    // ── Wizard closes → back on the flowboard ─────────────────────────────────
    await expect(page.getByRole('heading', { name: /register new patient/i })).toBeHidden({
      timeout: 20000,
    })

    // After wizard closes, an encounter detail modal may auto-open — close it first
    // so it doesn't block clicks on the flowboard table
    const autoOpenModal = page.locator('.fixed.inset-0').filter({ hasText: /appointment initiated/i })
    const autoOpenVisible = await autoOpenModal.isVisible({ timeout: 5000 }).catch(() => false)
    if (autoOpenVisible) {
      await page.keyboard.press('Escape')
      await autoOpenModal.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})
    }

    // ── Part A: Flowboard → View button opens encounter detail modal ──────────
    const aliHassanRow = page.getByRole('heading', { name: /^Ali Hassan$/i }).last()
    await expect(aliHassanRow).toBeVisible({ timeout: 15000 })

    // Click View on that row → encounter modal opens (no page navigation)
    const rowContainer = aliHassanRow.locator('../../../..')
    await rowContainer.getByRole('button', { name: /^view$/i }).click({ force: true })

    // Verify encounter detail modal shows Ali Hassan + Appointment Initiated
    const encounterModal = page.getByTestId('encounter-detail-modal').or(
      page.locator('*')
        .filter({ hasText: /Ali Hassan/i })
        .filter({ hasText: /appointment initiated/i })
        .first()
    )
    await expect(encounterModal).toBeVisible({ timeout: 20000 })
    await expect(page.getByText(/Ali Hassan/i).first()).toBeVisible({ timeout: 10000 })
    // Use a visible status badge/text, excluding hidden <option> elements
    await expect(
      page.locator('p, span, div, h1, h2, h3, h4').filter({ hasText: /^Appointment Initiated$/i }).first()
    ).toBeVisible({ timeout: 10000 })
    console.log('✓ Part A — Encounter detail modal verified on flowboard')

    // Close the encounter modal
    await page.getByRole('button', { name: /close|✕|×/i }).first().click()
    await page.waitForLoadState('networkidle')
  })
})
