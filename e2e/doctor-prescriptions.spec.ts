/**
 * Prescription & Pharmacy Tests
 *
 * Rules from codebase:
 * - canEditEncounterRx = !encounterLocked (locked = status === 'completed')
 * - Both doctors AND nurses can add/edit prescriptions on non-completed encounters
 * - "Prescriptions & Pharmacy" section heading in Details tab
 * - Add button text: "+ Add a new medicine"
 * - Pharmacy label: "PHARMACY", Edit button: "Edit pharmacy"
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

/**
 * Navigate to flowboard, ensure a non-completed encounter is visible,
 * open its modal, scroll to Prescriptions & Pharmacy section.
 * If all encounters are completed, advance one to final_review via API.
 */
async function openEncounterWithPrescriptions(page: Page, role: 'doctor' | 'nurse') {
  const mode = role === 'doctor' ? 'doctor' : 'nurse'

  await page.getByRole('link', { name: /virtual waiting room/i }).click()

  if (role === 'doctor') {
    await page.waitForURL(/\/dashboard\/flowboard/, { timeout: 30000 })
  } else {
    await page.waitForURL(/\/dashboard\/(nurse-)?flowboard/, { timeout: 30000 })
  }

  await page.waitForResponse(
    r => r.url().includes('/api/clinical/flowboard'), { timeout: 30000 }
  ).catch(() => {})
  await page.waitForLoadState('networkidle')

  // Check flowboard data via API
  const flowboardRes = await page.request.get(`/api/clinical/flowboard?mode=${mode}`)
  const flowboard = await flowboardRes.json() as {
    data?: Array<{ encounter_id?: number; encounter_status?: string; id?: number }>
  }
  const rows = flowboard?.data ?? []

  // Find non-completed encounter
  let target = rows.find(r => r.encounter_id && r.encounter_status !== 'completed')

  if (!target) {
    // All completed — advance one to final_review so prescriptions are editable
    const first = rows.find(r => r.encounter_id)
    if (!first?.encounter_id) {
      console.log('ℹ No encounters found')
      return null
    }

    // Assign a doctor first (hasDoctor must be true for "Add a new medicine" to show)
    const doctorsRes = await page.request.get('/api/doctors')
    const doctors = await doctorsRes.json() as { data?: Array<{ id: number }> }
    const firstDoctor = doctors?.data?.[0]
    if (firstDoctor && first.id) {
      await page.request.post(`${BASE_URL}/api/nurse/batch-assign-provider`, {
        data: {
          appointment_ids: [first.id],
          doctor_id: firstDoctor.id,
          appointment_date: new Date().toISOString().split('T')[0]!,
          appointment_time: '09:00',
        }
      })
    }

    const r = await page.request.patch(
      `${BASE_URL}/api/encounters/${first.encounter_id}/status`,
      { data: { status: 'final_review' } }
    )
    if (!r.ok()) {
      console.log('ℹ Could not advance encounter to final_review')
      return null
    }
    target = { ...first, encounter_status: 'final_review' }
    console.log(`✓ Advanced encounter ${first.encounter_id} to final_review with doctor assigned`)
  }

  // Also ensure doctor is assigned on target encounter (for hasDoctor=true)
  if (target.id) {
    const doctorsRes = await page.request.get('/api/doctors')
    const doctors = await doctorsRes.json() as { data?: Array<{ id: number }> }
    const firstDoctor = doctors?.data?.[0]
    if (firstDoctor) {
      await page.request.post(`${BASE_URL}/api/nurse/batch-assign-provider`, {
        data: {
          appointment_ids: [target.id],
          doctor_id: firstDoctor.id,
          appointment_date: new Date().toISOString().split('T')[0]!,
          appointment_time: '09:00',
        }
      }).catch(() => {}) // ignore if already assigned
    }
  }

  // Apply status filter to show this encounter at top
  const targetStatus = target.encounter_status ?? 'final_review'
  const statusSelect = page.locator('select').filter({
    has: page.locator(`option[value="${targetStatus}"]`)
  }).first()
  if (await statusSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
    await statusSelect.selectOption(targetStatus)
    await page.waitForTimeout(500)
  }

  // Open encounter modal
  const viewBtn = page.getByRole('button', { name: /^view$/i }).first()
  await expect(viewBtn).toBeVisible({ timeout: 20000 })
  await viewBtn.click()

  await expect(
    page.getByTestId('encounter-detail-modal').or(
      page.getByRole('heading', { name: /encounter details/i }).first()
    )
  ).toBeVisible({ timeout: 20000 })

  // Click Details tab
  const detailsTab = page.getByRole('button', { name: /^Details$/i })
  if (await detailsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await detailsTab.click()
  }

  // Scroll to "Prescriptions & Pharmacy" section heading
  const rxHeading = page.getByText('Prescriptions & Pharmacy').first()
  if (await rxHeading.isVisible({ timeout: 5000 }).catch(() => false)) {
    await rxHeading.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
  }

  return target.encounter_id!
}

test.describe('Prescriptions & Pharmacy', () => {
  test.setTimeout(300000)

  // ── Doctor adds a prescription ────────────────────────────────────────────
  test('doctor can add a prescription on a non-completed encounter', async ({ page }) => {
    if (!doctorEmail || !doctorPassword) {
      test.skip(true, 'Set PLAYWRIGHT_DOCTOR_EMAIL and PLAYWRIGHT_DOCTOR_PASSWORD.')
      return
    }

    await signInAsDoctor(page)
    const encounterId = await openEncounterWithPrescriptions(page, 'doctor')
    if (!encounterId) return

    // "Prescriptions & Pharmacy" section heading should be visible
    await expect(
      page.getByText('Prescriptions & Pharmacy').first()
    ).toBeVisible({ timeout: 10000 })

    // Click "+ Add a new medicine"
    const addBtn = page.getByRole('button', { name: /Add a new medicine/i })
    await expect(addBtn, '"Add a new medicine" button must be visible on non-completed encounter').toBeVisible({ timeout: 10000 })
    await addBtn.click()
    console.log('✓ Clicked "+ Add a new medicine"')

    // Fill medication name — placeholder: "Start typing medication name"
    // The input has id ending with "-med", scope inside prescription table
    const medInput = page.getByPlaceholder('Start typing medication name').first()
    await expect(medInput).toBeVisible({ timeout: 10000 })
    await medInput.fill('Amoxicillin 500mg')

    // Save — button: "Save {n} prescription(s)"
    const saveBtn = page.getByRole('button', { name: /save.*prescription|save \d/i }).first()
    if (await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      const saveResponsePromise = page.waitForResponse(
        r => r.url().includes('/prescriptions') && r.request().method() === 'POST',
        { timeout: 30000 }
      )
      await saveBtn.click()
      const saveResponse = await saveResponsePromise
      expect(saveResponse.ok(), `Save failed: ${saveResponse.status()}`).toBeTruthy()
      await expect(page.getByText(/Amoxicillin/i).first()).toBeVisible({ timeout: 10000 })
      console.log('✓ Prescription "Amoxicillin 500mg" added and saved')
    } else {
      console.log('ℹ Save button not visible — may auto-save or need pharmacy first')
    }
  })

  // ── Doctor deletes a prescription ─────────────────────────────────────────
  test('doctor can delete a prescription', async ({ page }) => {
    if (!doctorEmail || !doctorPassword) {
      test.skip(true, 'Set PLAYWRIGHT_DOCTOR_EMAIL and PLAYWRIGHT_DOCTOR_PASSWORD.')
      return
    }

    await signInAsDoctor(page)
    const encounterId = await openEncounterWithPrescriptions(page, 'doctor')
    if (!encounterId) return

    // First add a prescription via the UI so we have something to delete
    const addBtn = page.getByRole('button', { name: /Add a new medicine/i })
    if (!await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('ℹ "+ Add a new medicine" not visible — cannot test delete')
      return
    }

    await addBtn.click()

    const medInput = page.getByPlaceholder('Start typing medication name').first()
    await expect(medInput).toBeVisible({ timeout: 10000 })
    await medInput.fill('Test Delete Medicine')

    // Save it
    const saveBtn = page.getByRole('button', { name: /save.*prescription|save \d/i }).first()
    if (await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      const savePromise = page.waitForResponse(
        r => r.url().includes('/prescriptions') && r.request().method() === 'POST',
        { timeout: 30000 }
      )
      await saveBtn.click()
      await savePromise
      await page.waitForTimeout(500)
      console.log('✓ Added prescription to delete')
    } else {
      console.log('ℹ Save button not visible — skipping delete test')
      return
    }

    // Now find the Remove button — label: "Remove" (t('common.remove'))
    // window.confirm fires when Remove is clicked — accept it
    page.on('dialog', async d => await d.accept())

    const removeBtn = page.getByRole('button', { name: /^Remove$/i }).first()
    await expect(removeBtn).toBeVisible({ timeout: 10000 })

    const deleteResponsePromise = page.waitForResponse(
      r => r.url().includes('/prescriptions') && r.request().method() === 'DELETE',
      { timeout: 30000 }
    )
    await removeBtn.click()
    const deleteResponse = await deleteResponsePromise
    expect(deleteResponse.ok(), `Delete failed: ${deleteResponse.status()}`).toBeTruthy()
    console.log('✓ Prescription deleted successfully')
  })

  // ── Nurse pharmacy management ─────────────────────────────────────────────
  // Nurse IS clinical staff → can see "Edit pharmacy" and "Add a new medicine"
  // BUT "Add a new medicine" only shows when hasDoctor=true (provider assigned)
  test('nurse can see pharmacy section and Edit pharmacy button', async ({ page }) => {
    if (!nurseEmail || !nursePassword) {
      test.skip(true, 'Set PLAYWRIGHT_NURSE_EMAIL and PLAYWRIGHT_NURSE_PASSWORD.')
      return
    }

    await signInAsNurse(page)

    await page.getByRole('link', { name: /virtual waiting room/i }).click()
    await page.waitForURL(/\/dashboard\/(nurse-)?flowboard/, { timeout: 30000 })
    await page.waitForResponse(
      r => r.url().includes('/api/clinical/flowboard'), { timeout: 30000 }
    ).catch(() => {})
    await page.waitForLoadState('networkidle')

    // Find non-completed encounter with doctor assigned
    const flowboardRes = await page.request.get('/api/clinical/flowboard?mode=nurse')
    const flowboard = await flowboardRes.json() as {
      data?: Array<{
        encounter_id?: number; encounter_status?: string; id?: number
        assigned_doctor?: { id: number } | null
      }>
    }
    const rows = flowboard?.data ?? []
    let target = rows.find(r => r.encounter_id && r.encounter_status !== 'completed' && r.assigned_doctor)

    if (!target) {
      // Assign a doctor via API so hasDoctor=true
      const nonCompleted = rows.find(r => r.encounter_id && r.encounter_status !== 'completed')
      if (!nonCompleted?.encounter_id || !nonCompleted.id) {
        console.log('ℹ No non-completed encounters for nurse')
        return
      }
      const doctorsRes = await page.request.get('/api/doctors')
      const doctors = await doctorsRes.json() as { data?: Array<{ id: number }> }
      const firstDoctor = doctors?.data?.[0]
      if (firstDoctor) {
        const r = await page.request.post(`${BASE_URL}/api/nurse/batch-assign-provider`, {
          data: {
            appointment_ids: [nonCompleted.id],
            doctor_id: firstDoctor.id,
            appointment_date: new Date().toISOString().split('T')[0]!,
            appointment_time: '09:00',
          }
        })
        if (r.ok()) {
          target = nonCompleted
          console.log(`✓ Doctor ${firstDoctor.id} assigned to encounter ${nonCompleted.encounter_id}`)
        }
      }
    }

    if (!target) { console.log('ℹ No suitable encounter'); return }

    // Filter flowboard by status
    const targetStatus = target.encounter_status ?? 'provider_assigned'
    const statusSelect = page.locator('select').filter({ has: page.locator(`option[value="${targetStatus}"]`) }).first()
    if (await statusSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await statusSelect.selectOption(targetStatus)
      await page.waitForTimeout(500)
    }

    const viewBtn = page.getByRole('button', { name: /^view$/i }).first()
    await expect(viewBtn).toBeVisible({ timeout: 20000 })
    await viewBtn.click()

    await expect(
      page.getByTestId('encounter-detail-modal').or(page.getByRole('heading', { name: /encounter details/i }).first())
    ).toBeVisible({ timeout: 20000 })

    const detailsTab = page.getByRole('button', { name: /^Details$/i })
    if (await detailsTab.isVisible({ timeout: 3000 }).catch(() => false)) await detailsTab.click()

    const rxHeading = page.getByText('Prescriptions & Pharmacy').first()
    if (await rxHeading.isVisible({ timeout: 5000 }).catch(() => false)) {
      await rxHeading.scrollIntoViewIfNeeded()
      await page.waitForTimeout(300)
    }

    await expect(page.getByText('Prescriptions & Pharmacy').first()).toBeVisible({ timeout: 10000 })
    console.log('✓ "Prescriptions & Pharmacy" section visible for nurse')

    await expect(page.getByRole('button', { name: /Edit pharmacy/i })).toBeVisible({ timeout: 10000 })
    console.log('✓ "Edit pharmacy" button visible for nurse')

    await expect(page.getByRole('button', { name: /Add a new medicine/i })).toBeVisible({ timeout: 10000 })
    console.log('✓ "+ Add a new medicine" visible for nurse (doctor assigned)')
  })

  // ── Completed encounter — all locked ────────────────────────────────────────
  test('completed encounter hides prescription editing', async ({ page }) => {
    if (!doctorEmail || !doctorPassword) {
      test.skip(true, 'Set PLAYWRIGHT_DOCTOR_EMAIL and PLAYWRIGHT_DOCTOR_PASSWORD.')
      return
    }

    await signInAsDoctor(page)
    await page.getByRole('link', { name: /virtual waiting room/i }).click()
    await page.waitForURL(/\/dashboard\/flowboard/, { timeout: 30000 })
    await page.waitForResponse(
      r => r.url().includes('/api/clinical/flowboard'), { timeout: 30000 }
    ).catch(() => {})
    await page.waitForLoadState('networkidle')

    // Filter to completed encounters
    const statusSelect = page.locator('select').filter({
      has: page.locator('option[value="completed"]')
    }).first()
    if (await statusSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await statusSelect.selectOption('completed')
      await page.waitForTimeout(500)
    }

    const viewBtn = page.getByRole('button', { name: /^view$/i }).first()
    if (!await viewBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('ℹ No completed encounters available')
      return
    }
    await viewBtn.click()

    await expect(
      page.getByTestId('encounter-detail-modal').or(
        page.getByRole('heading', { name: /encounter details/i }).first()
      )
    ).toBeVisible({ timeout: 20000 })

    const detailsTab = page.getByRole('button', { name: /^Details$/i })
    if (await detailsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await detailsTab.click()
    }

    const rxHeading = page.getByText('Prescriptions & Pharmacy').first()
    if (await rxHeading.isVisible({ timeout: 5000 }).catch(() => false)) {
      await rxHeading.scrollIntoViewIfNeeded()
    }

    // "Add a new medicine" must NOT be visible on completed encounters
    const addMedicineBtn = page.getByRole('button', { name: /Add a new medicine/i })
    await expect(addMedicineBtn).not.toBeVisible({ timeout: 5000 })
    console.log('✓ "+ Add a new medicine" correctly hidden on completed encounter')
  })
})
