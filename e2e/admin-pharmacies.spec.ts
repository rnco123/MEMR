import { expect, test, type Page } from '@playwright/test'
import { signIn as adaptiveSignIn } from './helpers/sign-in'

const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL?.trim() || ''
const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD?.trim() || ''

function requireCredentials() {
  if (!adminEmail || !adminPassword) {
    test.skip(true, 'Set PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD.')
  }
}

async function signInAsAdmin(page: Page) {
  const json = await adaptiveSignIn(page, adminEmail, adminPassword)
  expect(json.role).toBe('admin')
  await page.waitForURL(/\/admin(?:\/)?$/, { timeout: 45000 })
}

test.describe('Admin — Pharmacies', () => {
  test.setTimeout(120000)

  // ── Pharmacy registry list loads ─────────────────────────────────────────────
  test('pharmacy registry list loads', async ({ page }) => {
    requireCredentials()
    await signInAsAdmin(page)

    await page.goto('/admin/pharmacies')
    await page.waitForLoadState('networkidle')

    // Heading should be visible
    await expect(
      page.getByRole('heading', { name: /pharmacy management|pharmacies/i }).first()
    ).toBeVisible({ timeout: 20000 })

    console.log('✓ Pharmacy registry loaded')
  })

  // ── Add a new pharmacy ───────────────────────────────────────────────────────
  test('admin can add a new pharmacy', async ({ page }) => {
    requireCredentials()
    await signInAsAdmin(page)

    await page.goto('/admin/pharmacies')
    await page.waitForLoadState('networkidle')

    // Click "Add pharmacy" to open the create form
    const addBtn = page.getByRole('button', { name: 'Add pharmacy' })
    await expect(addBtn).toBeVisible({ timeout: 20000 })
    await addBtn.click()

    // Create form appears — fill name using exact placeholder "e.g. CVS Downtown"
    const nameInput = page.getByPlaceholder('e.g. CVS Downtown')
    await expect(nameInput).toBeVisible({ timeout: 10000 })

    const uniqueName = `Test Pharmacy ${Date.now()}`
    await nameInput.fill(uniqueName)

    // Fill phone — placeholder: "5551234567"
    const phoneInput = page.getByPlaceholder('5551234567')
    if (await phoneInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await phoneInput.fill('5551234567')
    }

    // Fill email — placeholder: "orders@pharmacy.com"
    const emailInput = page.getByPlaceholder('orders@pharmacy.com')
    if (await emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await emailInput.fill(`test${Date.now()}@pharmacy.com`)
    }

    // Address has no placeholder — find it by its label position (3rd input in form)
    // It's the md:col-span-2 input after phone
    const addressInput = page.locator('form').locator('input').filter({ hasText: '' }).nth(2)
    if (await addressInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addressInput.fill('123 Pharmacy St, Houston, TX 77002')
    }

    // Submit — button text is "Save pharmacy"
    const saveBtn = page.getByRole('button', { name: 'Save pharmacy' })
    await expect(saveBtn).toBeEnabled({ timeout: 5000 })

    const saveResponsePromise = page.waitForResponse(
      r => r.url().includes('/api/pharmacies') && r.request().method() === 'POST',
      { timeout: 30000 }
    )

    await saveBtn.click()

    const saveResponse = await saveResponsePromise
    expect(saveResponse.ok(), `Pharmacy creation failed: ${saveResponse.status()}`).toBeTruthy()

    // Form closes and list reloads — search for the created pharmacy
    await page.waitForLoadState('networkidle')

    const searchInput = page.getByPlaceholder('Search by name, id, phone, email')
    await expect(searchInput).toBeVisible({ timeout: 15000 })
    await searchInput.fill(uniqueName)
    await page.waitForTimeout(600) // debounce

    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 10000 })
    console.log(`✓ Pharmacy "${uniqueName}" created and verified via search`)
  })

  // ── Edit an existing pharmacy ────────────────────────────────────────────────
  test('admin can edit an existing pharmacy', async ({ page }) => {
    requireCredentials()
    await signInAsAdmin(page)

    await page.goto('/admin/pharmacies')
    await page.waitForLoadState('networkidle')

    // Click Edit on the first pharmacy in the list
    const editBtn = page.getByRole('button', { name: 'Edit' }).first()
    await expect(editBtn).toBeVisible({ timeout: 20000 })
    await editBtn.click()

    // Inline edit form appears — name field placeholder is "Name *"
    const nameInput = page.getByPlaceholder('Name *')
    await expect(nameInput).toBeVisible({ timeout: 10000 })

    // Get current value and append "(edited)"
    const originalValue = await nameInput.inputValue()
    const updatedValue = originalValue.replace(' (edited)', '') + ' (edited)'
    await nameInput.fill(updatedValue)

    // Phone field in edit form — same placeholder "5551234567"
    const phoneInput = page.getByPlaceholder('5551234567').first()
    if (await phoneInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      const currentPhone = await phoneInput.inputValue()
      if (!currentPhone) await phoneInput.fill('5559876543')
    }

    // Save — inline save button text is "Save" (common.save key)
    const saveBtn = page.getByRole('button', { name: /^save$/i }).first()
    await expect(saveBtn).toBeEnabled({ timeout: 5000 })

    const saveResponsePromise = page.waitForResponse(
      r => /\/api\/pharmacies\/\d+/.test(r.url()) && r.request().method() === 'PATCH',
      { timeout: 30000 }
    )

    await saveBtn.click()

    const saveResponse = await saveResponsePromise
    expect(saveResponse.ok(), `Pharmacy edit failed: ${saveResponse.status()}`).toBeTruthy()

    // Updated name should appear in list
    await expect(page.getByText(updatedValue)).toBeVisible({ timeout: 15000 })
    console.log(`✓ Pharmacy edited to "${updatedValue}"`)
  })
})
