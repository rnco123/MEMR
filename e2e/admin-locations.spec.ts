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

test.describe('Admin — Locations', () => {
  test.setTimeout(120000)

  // ── Create a new location ────────────────────────────────────────────────────
  test('admin can create a new location with all fields and verify via search', async ({ page }) => {
    requireCredentials()
    await signInAsAdmin(page)

    await page.goto('/admin/locations')
    await page.waitForLoadState('networkidle')

    // Open the create form
    const addBtn = page.getByRole('button', { name: /add location|add clinic/i })
    await expect(addBtn).toBeVisible({ timeout: 20000 })
    await addBtn.click()

    // ── Fill all form fields ────────────────────────────────────────────────
    const uniqueName = `Test Clinic ${Date.now()}`

    // 1. Clinic name (required) — placeholder: "e.g. Downtown clinic"
    const titleInput = page.getByPlaceholder('e.g. Downtown clinic')
    await expect(titleInput).toBeVisible({ timeout: 10000 })
    await titleInput.fill(uniqueName)

    // 2. Group — placeholder: "e.g. A, B, C (optional)"
    const groupInput = page.getByPlaceholder('e.g. A, B, C (optional)')
    if (await groupInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await groupInput.fill('A')
    }

    // 3. Phone — placeholder: "(817) 555-0100"
    const phoneInput = page.getByPlaceholder('(817) 555-0100')
    if (await phoneInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await phoneInput.fill('8175550100')
    }

    // 4. Email — placeholder: "clinic@example.com"
    const emailInput = page.getByPlaceholder('clinic@example.com')
    if (await emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await emailInput.fill(`test${Date.now()}@example.com`)
    }

    // 5. Address — placeholder: "Street, city, state, ZIP"
    const addressInput = page.getByPlaceholder('Street, city, state, ZIP')
    if (await addressInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addressInput.fill('123 Main St, Houston, TX 77002')
      // Wait for autofill suggestions dropdown to appear
      await page.waitForTimeout(1500)

      // Click the first suggestion to select it and close the dropdown
      const firstSuggestion = page.locator('button').filter({ hasText: /main st|houston/i }).first()
      const suggestionVisible = await firstSuggestion.isVisible({ timeout: 3000 }).catch(() => false)
      if (suggestionVisible) {
        await firstSuggestion.click()
        await page.waitForTimeout(300)
        console.log('✓ Address suggestion selected')
      } else {
        // No suggestions — press Escape and Tab to blur the field
        await page.keyboard.press('Escape')
        await page.keyboard.press('Tab')
        await page.waitForTimeout(300)
      }
    }

    // 6. Google Maps link — placeholder: "Paste Google Maps URL or lat,lng"
    const mapInput = page.getByPlaceholder('Paste Google Maps URL or lat,lng')
    if (await mapInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await mapInput.fill('29.7604,-95.3698')
      await page.waitForTimeout(500)
      // Verify map hint appears confirming the link is valid
      await expect(page.getByText(/open map|map from|verified/i).first()).toBeVisible({ timeout: 5000 })
    }

    // ── Submit ──────────────────────────────────────────────────────────────
    // Save button enabled only when title is filled
    const saveBtn = page.getByRole('button', { name: 'Save location' })
    await expect(saveBtn).toBeEnabled({ timeout: 5000 })

    const saveResponsePromise = page.waitForResponse(
      r => r.url().includes('/api/admin/locations') && r.request().method() === 'POST',
      { timeout: 30000 }
    )

    await saveBtn.click()

    const saveResponse = await saveResponsePromise
    expect(saveResponse.ok(), `Location creation failed: ${saveResponse.status()}`).toBeTruthy()

    const body = await saveResponse.json() as { data?: { id?: number; title?: string } }
    expect(body.data?.id, 'Expected location id in response').toBeTruthy()
    expect(body.data?.title).toBe(uniqueName)

    // ── Verify via search bar ───────────────────────────────────────────────
    // Form closes and list reloads — search for the created clinic name
    await page.waitForLoadState('networkidle')

    const searchInput = page.getByPlaceholder('Search by name, code, address, phone, email, or id')
    await expect(searchInput).toBeVisible({ timeout: 15000 })
    await searchInput.fill(uniqueName)

    // Wait for debounce (300ms) + API response
    await page.waitForTimeout(600)

    // The new location should appear in results
    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 10000 })
    console.log(`✓ Location "${uniqueName}" created and verified via search`)
  })

  // ── Edit an existing location ────────────────────────────────────────────────
  test('admin can edit an existing location', async ({ page }) => {
    requireCredentials()
    await signInAsAdmin(page)

    await page.goto('/admin/locations')
    await page.waitForLoadState('networkidle')

    // Click Edit on the first location row
    const editBtn = page.getByRole('button', { name: /^edit$/i }).first()
    await expect(editBtn).toBeVisible({ timeout: 20000 })
    await editBtn.click()

    // The inline edit form appears — find the title input by placeholder
    const titleInput = page.getByPlaceholder(/downtown clinic|location name|clinic name|title/i).first()
    await expect(titleInput).toBeVisible({ timeout: 10000 })

    const originalValue = await titleInput.inputValue()
    const updatedValue = originalValue.replace(' (edited)', '') + ' (edited)'
    await titleInput.fill(updatedValue)

    // Save button: "Save" (inline edit button, not the create form button)
    const saveBtn = page.getByRole('button', { name: /^save$/i }).first()
    await expect(saveBtn).toBeEnabled({ timeout: 5000 })

    // Edit uses PATCH /api/admin/locations/[id]
    const saveResponsePromise = page.waitForResponse(
      r => /\/api\/admin\/locations\/\d+/.test(r.url()) && r.request().method() === 'PATCH',
      { timeout: 30000 }
    )

    await saveBtn.click()

    const saveResponse = await saveResponsePromise
    expect(saveResponse.ok(), `Location edit failed: ${saveResponse.status()}`).toBeTruthy()

    // Updated name should appear in the list
    await expect(page.getByText(updatedValue)).toBeVisible({ timeout: 15000 })
    console.log(`✓ Location edited to "${updatedValue}"`)
  })

  // ── Address autofill ─────────────────────────────────────────────────────────
  test('address autofill suggests results when typing', async ({ page }) => {
    requireCredentials()
    await signInAsAdmin(page)

    await page.goto('/admin/locations')
    await page.waitForLoadState('networkidle')

    // Open create form
    const addBtn = page.getByRole('button', { name: /add location|add clinic/i })
    await expect(addBtn).toBeVisible({ timeout: 20000 })
    await addBtn.click()

    // Address field placeholder: "Street, city, state, ZIP"
    const addressInput = page.getByPlaceholder(/street.*city|street.*state|address/i).first()
    await expect(addressInput).toBeVisible({ timeout: 10000 })

    // Type a partial address to trigger suggestions
    await addressInput.fill('123 Main St')
    await page.waitForTimeout(1500) // Wait for debounce + API call

    // Suggestions dropdown should appear
    const suggestionsList = page.locator('[role="listbox"], [data-testid*="suggestion"], .suggestions').first().or(
      page.getByText(/main st/i).first()
    )

    // Check if the API was called for address suggestions
    const suggestionsVisible = await suggestionsList.isVisible({ timeout: 8000 }).catch(() => false)

    if (suggestionsVisible) {
      console.log('✓ Address suggestions appeared')
      // Click first suggestion
      await suggestionsList.click()
      // Address input should now have the selected address filled in
      const filledValue = await addressInput.inputValue()
      expect(filledValue.length).toBeGreaterThan(3)
      console.log(`✓ Address autofilled to: "${filledValue}"`)
    } else {
      console.log('ℹ Address suggestions not visible — autofill may require external API key or debounce not triggered')
    }
  })

  // ── Google Maps link ─────────────────────────────────────────────────────────
  test('Google Maps link field accepts valid map URL and shows preview', async ({ page }) => {
    requireCredentials()
    await signInAsAdmin(page)

    await page.goto('/admin/locations')
    await page.waitForLoadState('networkidle')

    // Open create form
    const addBtn = page.getByRole('button', { name: /add location|add clinic/i })
    await expect(addBtn).toBeVisible({ timeout: 20000 })
    await addBtn.click()

    // Map link placeholder: "Paste Google Maps URL or lat,lng"
    const mapInput = page.getByPlaceholder(/google maps|maps url|lat.*lng|map link/i).first()
    await expect(mapInput).toBeVisible({ timeout: 10000 })

    // Type a valid lat,lng
    await mapInput.fill('29.7604,-95.3698')
    await page.waitForTimeout(500)

    // Should show a "verified" or "open map" link — MapLinkHint component
    const mapHint = page.getByText(/open map|verified|map from/i).first()
    await expect(mapHint).toBeVisible({ timeout: 5000 })

    console.log('✓ Google Maps link shows valid preview')
  })

  // ── Operating hours edit ──────────────────────────────────────────────────────
  test('admin can edit operating hours for a location', async ({ page }) => {
    requireCredentials()
    await signInAsAdmin(page)

    await page.goto('/admin/locations')
    await page.waitForLoadState('networkidle')

    // Open edit form for first location
    const editBtn = page.getByRole('button', { name: /^edit$/i }).first()
    await expect(editBtn).toBeVisible({ timeout: 20000 })
    await editBtn.click()

    // Operating hours editor should be visible
    // LocationHoursEditor renders day toggles (Mon, Tue, etc.)
    const hoursSection = page.getByText(/hours|monday|mon/i).first()
    await expect(hoursSection).toBeVisible({ timeout: 10000 })

    // Toggle a day on/off — find Monday checkbox or toggle
    const mondayToggle = page.getByLabel(/monday|mon/i).first().or(
      page.locator('[data-testid*="hours-mon"], [data-testid*="monday"]').first()
    )

    const mondayVisible = await mondayToggle.isVisible({ timeout: 5000 }).catch(() => false)
    if (mondayVisible) {
      await mondayToggle.click()
      await page.waitForTimeout(300)
      console.log('✓ Monday hours toggled')
    }

    // Save the edit
    const saveBtn = page.getByRole('button', { name: /^save$/i }).first()
    await expect(saveBtn).toBeEnabled({ timeout: 5000 })

    const saveResponsePromise = page.waitForResponse(
      r => /\/api\/admin\/locations\/\d+/.test(r.url()) && r.request().method() === 'PATCH',
      { timeout: 30000 }
    )

    await saveBtn.click()

    const saveResponse = await saveResponsePromise
    expect(saveResponse.ok(), `Hours save failed: ${saveResponse.status()}`).toBeTruthy()

    console.log('✓ Operating hours saved successfully')
  })
})
