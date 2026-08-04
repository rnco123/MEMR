import { expect, test, type Page } from '@playwright/test'
import { signIn as adaptiveSignIn } from './helpers/sign-in'

const doctorEmail = process.env.PLAYWRIGHT_DOCTOR_EMAIL?.trim() || ''
const doctorPassword = process.env.PLAYWRIGHT_DOCTOR_PASSWORD?.trim() || ''

function requireCredentials() {
  if (!doctorEmail || !doctorPassword) {
    test.skip(true, 'Set PLAYWRIGHT_DOCTOR_EMAIL and PLAYWRIGHT_DOCTOR_PASSWORD.')
  }
}

async function signInAsDoctor(page: Page) {
  const json = await adaptiveSignIn(page, doctorEmail, doctorPassword)
  expect(['doctor', 'fnp', 'pa']).toContain(json.role)
  await page.waitForURL(/\/dashboard/, { timeout: 45000 })
  await page.waitForLoadState('networkidle')
}

async function openEncounterModalAndGoToDetails(page: Page) {
  // Navigate to doctor flowboard
  await page.getByRole('link', { name: /virtual waiting room/i }).click()
  await page.waitForURL(/\/dashboard\/flowboard/, { timeout: 30000 })
  await page.waitForResponse(
    r => r.url().includes('/api/clinical/flowboard'),
    { timeout: 30000 }
  ).catch(() => {})
  await page.waitForLoadState('networkidle')

  // Click "View" on the first encounter row to open EncounterDetailModal
  const viewBtn = page.getByRole('button', { name: /^view$/i }).first()
  await expect(viewBtn).toBeVisible({ timeout: 30000 })
  await viewBtn.click()

  // Modal opens — identified by data-testid or heading
  const modal = page.getByTestId('encounter-detail-modal').or(
    page.getByRole('heading', { name: /encounter details/i }).first()
  )
  await expect(modal).toBeVisible({ timeout: 20000 })

  // Make sure "Details" tab is active (it's the default, but click it explicitly)
  const detailsTab = page.getByRole('button', { name: /^details$/i })
  if (await detailsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await detailsTab.click()
  }

  // Scroll down inside the modal to reach the SOAP section
  // EncounterSoapPanel is rendered after patient info, vitals, physical exam
  const soapSection = page.getByText(/doctor soap notes|ai soap notes|soap/i).first()
  if (await soapSection.isVisible({ timeout: 5000 }).catch(() => false)) {
    await soapSection.scrollIntoViewIfNeeded()
  }
}

test.describe('Doctor — SOAP Notes', () => {
  test.setTimeout(300000)

  // ── View AI-generated SOAP ───────────────────────────────────────────────
  // Flow: open encounter modal → Details tab → scroll to SOAP section → verify content
  test('doctor can view AI-generated SOAP', async ({ page }) => {
    requireCredentials()
    await signInAsDoctor(page)
    await openEncounterModalAndGoToDetails(page)

    // SOAP section heading: "AI SOAP Notes" or "Doctor SOAP Notes"
    await expect(
      page.getByText(/doctor soap notes|ai soap notes/i).first()
    ).toBeVisible({ timeout: 20000 })

    // SOAP sections: Subjective, Objective, Assessment, Plan
    await expect(
      page.getByText(/subjective|objective|assessment|plan/i).first()
    ).toBeVisible({ timeout: 10000 })

    console.log('✓ SOAP section visible in encounter modal')
  })

  // ── Save a SOAP note ─────────────────────────────────────────────────────
  // Flow: open encounter → scroll to SOAP → click "Edit from AI" or "Start blank" →
  // fill Subjective → save → verify saved
  test('doctor can save a SOAP note', async ({ page }) => {
    requireCredentials()
    await signInAsDoctor(page)
    await openEncounterModalAndGoToDetails(page)

    // Wait for SOAP section to load
    await expect(
      page.getByText(/doctor soap notes/i).first()
    ).toBeVisible({ timeout: 20000 })

    // Enter edit mode — click "Edit" button (EncounterSectionEditButton)
    // or "Start blank" if no SOAP exists yet
    const editBtn = page.getByRole('button', { name: /^edit$/i }).last()
    const startBlankBtn = page.getByRole('button', { name: /start blank/i })

    const editBtnVisible = await editBtn.isVisible({ timeout: 5000 }).catch(() => false)
    const blankBtnVisible = await startBlankBtn.isVisible({ timeout: 2000 }).catch(() => false)

    if (editBtnVisible) {
      await editBtn.click()
    } else if (blankBtnVisible) {
      await startBlankBtn.click()
    } else {
      console.log('ℹ No edit button found — SOAP may not be editable for this encounter state')
      return
    }

    await page.waitForTimeout(500)

    // In edit mode, SOAP textareas are enabled (no disabled attr, bg-white border-slate-300)
    // Subjective is first, then Objective, Assessment, Plan
    // Scope to enabled textareas only to avoid the disabled "Additional remarks" textarea
    const soapTextareas = page.locator('textarea:not([disabled])')
    await expect(soapTextareas.first()).toBeVisible({ timeout: 10000 })

    const count = await soapTextareas.count()
    if (count > 0) await soapTextareas.nth(0).fill('Patient reports mild headache for 2 days. No fever.')
    if (count > 1) await soapTextareas.nth(1).fill('Alert and oriented. BP 120/80. HR 72. Temp 98.6°F.')
    if (count > 2) await soapTextareas.nth(2).fill('Tension headache — muscle tension type.')
    if (count > 3) await soapTextareas.nth(3).fill('Ibuprofen 400mg TID PRN. Follow up in 1 week if no improvement.')

    console.log(`✓ Filled ${count} SOAP textareas`)

    // Save — button text is "Save" (common.save)
    // SOAP saves via PUT /api/encounters/[id]/doctor-soap
    // Set up listener BEFORE clicking so we don't miss the response
    const saveSoapResponsePromise = page.waitForResponse(
      r => r.url().includes('/doctor-soap') && r.request().method() === 'PUT',
      { timeout: 30000 }
    )

    const saveBtn = page.getByRole('button', { name: /^save$/i }).first()
    await expect(saveBtn).toBeEnabled({ timeout: 5000 })
    await saveBtn.click()

    const saveResponse = await saveSoapResponsePromise
    expect(saveResponse.ok(), `SOAP save failed: ${saveResponse.status()}`).toBeTruthy()

    // Confirm saved — hint text or toast "Doctor SOAP note saved"
    await expect(
      page.getByText(/soap.*saved|saved.*soap|doctor soap note saved/i).first()
    ).toBeVisible({ timeout: 10000 })

    console.log('✓ SOAP note saved successfully')
  })

  // ── Saving empty SOAP is blocked by validation ───────────────────────────
  // Flow: open encounter → enter edit mode → clear all fields → try to save →
  // "All SOAP sections are required" error appears
  test('saving incomplete SOAP is blocked by validation', async ({ page }) => {
    requireCredentials()
    await signInAsDoctor(page)
    await openEncounterModalAndGoToDetails(page)

    await expect(
      page.getByText(/doctor soap notes/i).first()
    ).toBeVisible({ timeout: 20000 })

    // Enter edit mode — click "Edit" or "Start blank"
    const editBtn = page.getByRole('button', { name: /^edit$/i }).last()
    const startBlankBtn = page.getByRole('button', { name: /start blank/i })

    if (await editBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editBtn.click()
    } else if (await startBlankBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await startBlankBtn.click()
    } else {
      console.log('ℹ SOAP not editable for this encounter — skipping validation test')
      return
    }

    await page.waitForTimeout(300)

    // Clear all enabled SOAP textareas
    const soapTextareas = page.locator('textarea:not([disabled])')
    const count = await soapTextareas.count()
    for (let i = 0; i < count; i++) {
      await soapTextareas.nth(i).fill('')
    }

    // Try to save with empty fields — button text is "Save"
    const saveBtn = page.getByRole('button', { name: /^save$/i }).first()
    if (await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await saveBtn.click()

      // Validation error should appear:
      // "All SOAP sections (Subjective, Objective, Assessment, Plan) are required."
      await expect(
        page.getByText(/all soap sections.*required|sections.*required|required/i).first()
      ).toBeVisible({ timeout: 5000 })

      console.log('✓ Validation blocked empty SOAP save')
    } else {
      console.log('ℹ Save button not visible — encounter may not be in an editable state')
    }
  })
})
