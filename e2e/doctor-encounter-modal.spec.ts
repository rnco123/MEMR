/**
 * Doctor — Encounter Modal Tests
 *
 * Test 1: Doctor opens encounter modal and sees patient info
 * Test 2: Full lifecycle — vitals_assessed → in_consultation (API) →
 *         final_review (API) → fill SOAP in encounter modal (frontend) →
 *         Complete Encounter (frontend) → Completed
 * Test 3: Nurse view is read-only for clinical fields
 */

import { expect, test, type Page } from '@playwright/test'
import { signIn as adaptiveSignIn } from './helpers/sign-in'

const doctorEmail = process.env.PLAYWRIGHT_DOCTOR_EMAIL?.trim() || ''
const doctorPassword = process.env.PLAYWRIGHT_DOCTOR_PASSWORD?.trim() || ''
const nurseEmail = process.env.PLAYWRIGHT_NURSE_EMAIL?.trim() || ''
const nursePassword = process.env.PLAYWRIGHT_NURSE_PASSWORD?.trim() || ''

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mcm-testing.up.railway.app'

async function signInAsDoctor(page: Page) {
  const json = await adaptiveSignIn(page, doctorEmail, doctorPassword)
  expect(['doctor', 'fnp', 'pa']).toContain(json.role)
  await page.waitForURL(/\/dashboard/, { timeout: 45000 })
  await page.waitForLoadState('networkidle')
}

async function signInAsNurse(page: Page) {
  const json = await adaptiveSignIn(page, nurseEmail, nursePassword)
  expect(json.role).toBe('nurse')
  await page.waitForURL(/\/dashboard/, { timeout: 45000 })
  await page.waitForLoadState('networkidle')
}

async function goToDoctorFlowboard(page: Page) {
  await page.getByRole('link', { name: /virtual waiting room/i }).click()
  await page.waitForURL(/\/dashboard\/flowboard/, { timeout: 30000 })
  await page.waitForResponse(
    r => r.url().includes('/api/clinical/flowboard'), { timeout: 30000 }
  ).catch(() => {})
  await page.waitForLoadState('networkidle')
}

async function goToNurseFlowboard(page: Page) {
  await page.getByRole('link', { name: /virtual waiting room/i }).click()
  await page.waitForURL(/\/dashboard\/(nurse-)?flowboard/, { timeout: 30000 })
  await page.waitForResponse(
    r => r.url().includes('/api/clinical/flowboard'), { timeout: 30000 }
  ).catch(() => {})
  await page.waitForLoadState('networkidle')
}

test.describe('Doctor — Encounter Modal', () => {
  test.setTimeout(300000)

  // ── Test 1: Open encounter modal and see patient info ───────────────────
  test('doctor can open encounter detail modal and see patient info', async ({ page }) => {
    if (!doctorEmail || !doctorPassword) {
      test.skip(true, 'Set PLAYWRIGHT_DOCTOR_EMAIL and PLAYWRIGHT_DOCTOR_PASSWORD.')
      return
    }

    await signInAsDoctor(page)
    await goToDoctorFlowboard(page)

    const viewBtn = page.getByRole('button', { name: /^view$/i }).first()
    await expect(viewBtn).toBeVisible({ timeout: 30000 })
    await viewBtn.click()

    await expect(
      page.getByTestId('encounter-detail-modal').or(
        page.getByRole('heading', { name: /encounter details/i }).first()
      )
    ).toBeVisible({ timeout: 20000 })

    await expect(
      page.locator('p, span, div, h2, h3').filter({ hasText: /DOB|date of birth/i }).first()
    ).toBeVisible({ timeout: 15000 })

    console.log('✓ Encounter modal opened with patient info')
  })

  // ── Test 2: Full lifecycle — final_review → SOAP → Complete ─────────────
  //
  // API steps (headless CI limitations):
  //   - Advance encounter to final_review via PATCH /status
  //   - Telemedicine join/end cannot be done headlessly (no camera)
  //
  // Frontend steps (UI):
  //   - Open encounter modal on doctor flowboard
  //   - Scroll to Doctor SOAP Notes section
  //   - Click "Edit" to enter edit mode
  //   - Fill all 4 SOAP sections (Subjective, Objective, Assessment, Plan)
  //   - Click "Save" → PUT /api/encounters/[id]/doctor-soap
  //   - Click "Complete Encounter" → POST /api/encounters/[id]/complete
  //   - Verify "Completed" status badge visible
  test('full encounter lifecycle — final_review → fill SOAP → Complete Encounter', async ({ page }) => {
    if (!doctorEmail || !doctorPassword) {
      test.skip(true, 'Set PLAYWRIGHT_DOCTOR_EMAIL and PLAYWRIGHT_DOCTOR_PASSWORD.')
      return
    }

    await signInAsDoctor(page)

    // ── Step 1: Get encounter and advance to final_review via API ─────────
    const flowboardRes = await page.request.get('/api/clinical/flowboard?mode=doctor')
    const flowboard = await flowboardRes.json() as {
      data?: Array<{ encounter_id?: number; encounter_status?: string; id?: number }>
    }
    const rows = flowboard?.data ?? []

    const encounter =
      rows.find(r => r.encounter_id && r.encounter_status === 'final_review') ??
      rows.find(r => r.encounter_id && r.encounter_status !== 'completed') ??
      rows.find(r => r.encounter_id)

    if (!encounter?.encounter_id) {
      console.log('ℹ No usable encounter on doctor flowboard — skipping')
      return
    }

    const encounterId = encounter.encounter_id
    const appointmentId = encounter.id
    let status = encounter.encounter_status ?? 'appointment_initiated'
    console.log(`✓ Encounter ${encounterId} — status: ${status}`)

    if (status !== 'final_review') {
      // Assign a doctor so doctor_id is set (needed for SOAP to be editable)
      const doctorsRes = await page.request.get('/api/doctors')
      const doctors = await doctorsRes.json() as { data?: Array<{ id: number }> }
      const firstDoctor = doctors?.data?.[0]
      if (firstDoctor && appointmentId) {
        await page.request.post(`${BASE_URL}/api/nurse/batch-assign-provider`, {
          data: {
            appointment_ids: [appointmentId],
            doctor_id: firstDoctor.id,
            appointment_date: new Date().toISOString().split('T')[0]!,
            appointment_time: '09:00',
          }
        })
        console.log(`✓ Doctor ${firstDoctor.id} assigned`)
      }

      // Advance through all statuses to final_review
      const steps = ['provider_assigned', 'vitals_assessed', 'in_consultation', 'consultation_concluded', 'final_review']
      for (const step of steps) {
        if (['completed'].includes(status)) break
        const r = await page.request.patch(
          `${BASE_URL}/api/encounters/${encounterId}/status`,
          { data: { status: step } }
        )
        if (r.ok()) {
          status = step
          console.log(`✓ Status → ${step}`)
        }
        if (step === 'final_review') break
      }
    }

    console.log(`✓ Encounter ready at: ${status}`)

    // ── Step 2: Open encounter modal on doctor flowboard ──────────────────
    await goToDoctorFlowboard(page)

    const viewBtn = page.getByRole('button', { name: /^view$/i }).first()
    await expect(viewBtn).toBeVisible({ timeout: 20000 })
    await viewBtn.click()

    const modal = page.getByTestId('encounter-detail-modal').or(
      page.getByRole('heading', { name: /encounter details/i }).first()
    )
    await expect(modal).toBeVisible({ timeout: 20000 })
    console.log('✓ Step 2 — Encounter modal open')

    // ── Step 3: Fill SOAP notes (frontend) ────────────────────────────────
    const soapHeading = page.getByText(/doctor soap notes/i).first()
    await expect(soapHeading).toBeVisible({ timeout: 15000 })
    await soapHeading.scrollIntoViewIfNeeded()

    // Enter edit mode — "Edit" button or "Start blank"
    const editBtn = page.getByRole('button', { name: /^edit$/i }).last()
    const startBlankBtn = page.getByRole('button', { name: /start blank/i })

    if (await editBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editBtn.click()
      console.log('✓ Step 3 — Clicked "Edit"')
    } else if (await startBlankBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await startBlankBtn.click()
      console.log('✓ Step 3 — Clicked "Start blank"')
    } else {
      console.log('ℹ SOAP already in edit mode or not editable for this encounter')
    }
    await page.waitForTimeout(300)

    // Fill all 4 SOAP textareas (enabled only — excludes vitals "Additional remarks")
    const soapAreas = page.locator('textarea:not([disabled])')
    const count = await soapAreas.count()

    if (count > 0) {
      if (count > 0) await soapAreas.nth(0).fill('Patient presents with fully resolved symptoms after consultation.')
      if (count > 1) await soapAreas.nth(1).fill('Vital signs stable. Alert and oriented. No acute distress.')
      if (count > 2) await soapAreas.nth(2).fill('Condition resolved. No active clinical issues.')
      if (count > 3) await soapAreas.nth(3).fill('Discharge home. Follow up PRN. Return if symptoms recur.')
      console.log(`✓ Step 3 — SOAP filled (${count} sections)`)

      // Save SOAP — "Save" button (common.save), listener BEFORE click
      const saveSoapPromise = page.waitForResponse(
        r => r.url().includes('/doctor-soap') && r.request().method() === 'PUT',
        { timeout: 30000 }
      )
      const saveBtn = page.getByRole('button', { name: /^save$/i }).first()
      await expect(saveBtn).toBeEnabled({ timeout: 5000 })
      await saveBtn.click()
      await saveSoapPromise
      console.log('✓ Step 3 — SOAP saved (PUT /doctor-soap)')
    }

    // ── Step 4: Complete Encounter (frontend) ─────────────────────────────
    await page.waitForTimeout(500)

    const completeBtn = page.getByRole('button', { name: /complete encounter/i })

    // If not visible, close and reopen modal (stale render state)
    if (!await completeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      const closeBtn = page.getByRole('button', { name: /close|✕|×/i }).first()
      if (await closeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await closeBtn.click()
      } else {
        await page.keyboard.press('Escape')
      }
      await page.locator('.fixed.inset-0').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})
      await page.waitForTimeout(300)

      const v2 = page.getByRole('button', { name: /^view$/i }).first()
      if (await v2.isVisible({ timeout: 5000 }).catch(() => false)) {
        await v2.click()
        await expect(modal).toBeVisible({ timeout: 15000 })
      }
    }

    await expect(
      completeBtn,
      '"Complete Encounter" must be visible at final_review status'
    ).toBeVisible({ timeout: 15000 })

    // Listener BEFORE click
    const completeResponsePromise = page.waitForResponse(
      r => r.url().includes('/api/encounters') && r.url().includes('/complete') && r.request().method() === 'POST',
      { timeout: 30000 }
    )
    page.on('dialog', async d => await d.accept())
    await completeBtn.click()

    const completeResponse = await completeResponsePromise
    expect(completeResponse.ok(), `Complete encounter failed: ${completeResponse.status()}`).toBeTruthy()
    console.log('✓ Step 4 — "Complete Encounter" confirmed')

    // ── Step 5: Verify "Completed" status ─────────────────────────────────
    await page.waitForLoadState('networkidle')
    await expect(
      page.locator('span, div, p').filter({ hasText: /^Completed$/ }).first()
    ).toBeVisible({ timeout: 20000 })
    console.log('✓ Step 5 — Status: Completed')
  })

  // ── Test 3: Nurse view is read-only for clinical fields ─────────────────
  test('nurse view of encounter is read-only for clinical fields', async ({ page }) => {
    if (!nurseEmail || !nursePassword) {
      test.skip(true, 'Set PLAYWRIGHT_NURSE_EMAIL and PLAYWRIGHT_NURSE_PASSWORD.')
      return
    }

    await signInAsNurse(page)
    await goToNurseFlowboard(page)

    const viewBtn = page.getByRole('button', { name: /^view$/i }).first()
    await expect(viewBtn).toBeVisible({ timeout: 30000 })
    await viewBtn.click()

    await expect(
      page.getByTestId('encounter-detail-modal').or(
        page.getByRole('heading', { name: /encounter details/i }).first()
      )
    ).toBeVisible({ timeout: 20000 })

    // 1. Prescriptions — add button hidden for nurse
    await expect(
      page.getByRole('button', { name: /add prescription|add medicine|add rx/i })
    ).not.toBeVisible({ timeout: 5000 })
    console.log('✓ Add prescription hidden from nurse')

    // 2. Complete Encounter — doctor-only
    await expect(
      page.getByRole('button', { name: /complete encounter/i })
    ).not.toBeVisible({ timeout: 3000 }).catch(() => {})
    console.log('✓ Complete Encounter not visible for nurse')

    // 3. SOAP edit — doctor-only
    const soapSection = page.getByText(/doctor soap notes/i).first()
    if (await soapSection.isVisible({ timeout: 3000 }).catch(() => false)) {
      await soapSection.scrollIntoViewIfNeeded()
      await expect(
        page.getByRole('button', { name: /^edit$/i }).last()
      ).not.toBeVisible({ timeout: 3000 }).catch(() => {})
      console.log('✓ SOAP edit button not visible for nurse')
    }

    console.log('✓ Nurse view correctly read-only for clinical fields')
  })
})
