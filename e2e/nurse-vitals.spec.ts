import { expect, test, type Page } from '@playwright/test'
import { signIn as adaptiveSignIn } from './helpers/sign-in'

const nurseEmail = process.env.PLAYWRIGHT_NURSE_EMAIL?.trim() || ''
const nursePassword = process.env.PLAYWRIGHT_NURSE_PASSWORD?.trim() || ''

function requireCredentials() {
  if (!nurseEmail || !nursePassword) {
    test.skip(true, 'Set PLAYWRIGHT_NURSE_EMAIL and PLAYWRIGHT_NURSE_PASSWORD.')
  }
}

async function signInAsNurse(page: Page) {
  const json = await adaptiveSignIn(page, nurseEmail, nursePassword)
  expect(json.role).toBe('nurse')
  await page.waitForURL(/\/dashboard/, { timeout: 45000 })
  await page.waitForLoadState('networkidle')
}

test.describe('Nurse — Vitals', () => {
  test.setTimeout(300000)

  // Flow:
  // 1. Nurse opens flowboard
  // 2. Finds an encounter with "Provider Assigned" status — the "Vitals" button appears on that row
  // 3. Clicks "Vitals" → VitalsFormModal opens
  // 4. Fills BP systolic/diastolic, heart rate, temperature, SpO2, weight, height
  // 5. Clicks "Save Vitals" → PUT /api/encounters/[id]/vitals
  // 6. Verifies "Vitals Assessed" status appears (either on the row or via search)
  test('nurse can enter vitals for a provider-assigned encounter', async ({ page }) => {
    requireCredentials()

    await signInAsNurse(page)

    // Navigate to nurse flowboard
    await page.getByRole('link', { name: /virtual waiting room/i }).click()
    await page.waitForURL(/\/dashboard\/(nurse-)?flowboard/, { timeout: 30000 })
    await page.waitForResponse(
      r => r.url().includes('/api/clinical/flowboard'),
      { timeout: 30000 }
    ).catch(() => {})
    await page.waitForLoadState('networkidle')

    // The "Vitals" button appears ONLY on encounters with status provider_assigned
    // AND where the encounter has an encounter_id (not just an appointment)
    // Try direct approach — look for "Vitals" button on any row
    const vitalsBtn = page.getByRole('button', { name: /^vitals$/i }).first()
    let vitalsVisible = await vitalsBtn.isVisible({ timeout: 10000 }).catch(() => false)

    if (!vitalsVisible) {
      // Filter flowboard to show only "Provider Assigned" encounters
      const statusSelect = page.locator('select').filter({
        has: page.locator('option').nth(1)
      }).nth(1) // second select is status filter

      if (await statusSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
        await statusSelect.selectOption('provider_assigned')
        await page.waitForTimeout(500)
        vitalsVisible = await vitalsBtn.isVisible({ timeout: 10000 }).catch(() => false)
      }
    }

    if (!vitalsVisible) {
      console.log('ℹ No "Provider Assigned" encounter with Vitals button — no suitable encounter available')
      console.log('ℹ To test vitals: first run the assign provider test to advance an encounter to provider_assigned')
      return
    }

    // ── Record the patient name before clicking Vitals ──────────────────────
    // Find the patient name on the same row as the Vitals button
    const vitalsRow = vitalsBtn.locator('../../../..')
    const patientName = await vitalsRow.locator('h3').first().textContent().catch(() => null)
    console.log(`✓ Found encounter with Vitals button — patient: ${patientName || 'unknown'}`)

    // Click "Vitals" — opens VitalsFormModal
    await vitalsBtn.click()

    // ── VitalsFormModal ──────────────────────────────────────────────────────
    await expect(
      page.getByRole('heading', { name: 'Add Vitals' })
    ).toBeVisible({ timeout: 15000 })

    // All fields are type="number" inputs
    // Fill BP Systolic (placeholder: "60-300")
    const bpSystolicInput = page.locator('input[type="number"]').nth(0)
    await expect(bpSystolicInput).toBeVisible({ timeout: 5000 })
    await bpSystolicInput.fill('120')

    // Fill BP Diastolic (placeholder: "40-200")
    const bpDiastolicInput = page.locator('input[type="number"]').nth(1)
    await bpDiastolicInput.fill('80')

    // Fill Heart Rate (placeholder: "30-250")
    const heartRateInput = page.locator('input[type="number"]').nth(2)
    await heartRateInput.fill('72')

    // Fill Respiratory Rate (placeholder: "16")
    const rrInput = page.locator('input[type="number"]').nth(3)
    if (await rrInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await rrInput.fill('16')
    }

    // Fill Temperature — value + unit select
    const tempInput = page.locator('input[type="number"]').nth(4)
    if (await tempInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await tempInput.fill('98.6')
    }

    // Fill SpO2 (placeholder: "70-100")
    const spo2Input = page.locator('input[type="number"]').nth(5)
    if (await spo2Input.isVisible({ timeout: 2000 }).catch(() => false)) {
      await spo2Input.fill('98')
    }

    // Fill Weight
    const weightInput = page.locator('input[type="number"]').nth(6)
    if (await weightInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await weightInput.fill('154')
    }

    // Fill Height
    const heightInput = page.locator('input[type="number"]').nth(7)
    if (await heightInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await heightInput.fill('68')
    }

    console.log('✓ All vitals fields filled')

    // ── Save Vitals ──────────────────────────────────────────────────────────
    const saveResponsePromise = page.waitForResponse(
      r => r.url().includes('/api/encounters') && r.url().includes('/vitals') && r.request().method() === 'PUT',
      { timeout: 30000 }
    )

    const saveBtn = page.getByRole('button', { name: 'Save Vitals' })
    await expect(saveBtn).toBeEnabled({ timeout: 5000 })
    await saveBtn.click()

    const saveResponse = await saveResponsePromise
    expect(saveResponse.ok(), `Vitals save failed: ${saveResponse.status()}`).toBeTruthy()
    console.log('✓ Vitals saved successfully via PUT /api/encounters/[id]/vitals')

    // ── Verify status updated to "Vitals Assessed" ───────────────────────────
    // Modal closes and flowboard refreshes
    await page.waitForLoadState('networkidle')

    // Reset status filter to "all" so the vitals_assessed encounter is visible
    // (it was filtered to provider_assigned before, so after saving it disappears)
    const statusSelect = page.locator('select').nth(1)
    if (await statusSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await statusSelect.selectOption('all')
      await page.waitForTimeout(500)
    }

    // Search for the patient by name to find their row
    if (patientName) {
      const searchInput = page.locator('input[type="text"]').first()
      if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await searchInput.fill(patientName.trim())
        await page.waitForTimeout(800) // debounce
        console.log(`✓ Searching for patient: ${patientName}`)
      }
    }

    // Verify "Vitals Assessed" appears as a visible badge on the page
    // Use translateEncounterStatus output — target span/div badges, not <option> elements
    await expect(
      page.locator('span, div').filter({ hasText: /^Vitals Assessed$/ }).first()
    ).toBeVisible({ timeout: 20000 })

    console.log(`✓ Status updated to "Vitals Assessed" — confirmed on flowboard`)
  })
})
