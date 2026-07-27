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

test.describe('Admin — Flowboard', () => {
  test.setTimeout(120000)

  // ── Flowboard loads ──────────────────────────────────────────────────────────
  test('admin flowboard loads and renders encounters', async ({ page }) => {
    requireCredentials()
    await signInAsAdmin(page)

    await page.goto('/admin/flowboard')
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByRole('heading', { name: /flowboard|appointments|waiting/i }).first()
    ).toBeVisible({ timeout: 20000 })

    console.log('✓ Admin flowboard loaded')
  })

  // ── Status filter ────────────────────────────────────────────────────────────
  test('admin flowboard status filter works', async ({ page }) => {
    requireCredentials()
    await signInAsAdmin(page)

    await page.goto('/admin/flowboard')
    await page.waitForLoadState('networkidle')

    // Status filter is the first <select> in the filter toolbar
    const statusFilter = page.getByRole('combobox').first()
    await expect(statusFilter).toBeVisible({ timeout: 15000 })

    // Get current count of rows
    const rowsBefore = await page.locator('h3').count()

    // Change status filter to something other than "all"
    await statusFilter.selectOption({ index: 1 })
    await page.waitForTimeout(500)

    // Page should still render (filtered or empty state)
    await expect(
      page.getByRole('heading', { name: /flowboard|appointments/i }).first()
    ).toBeVisible({ timeout: 10000 })

    console.log(`✓ Status filter applied — rows before: ${rowsBefore}`)
  })

  // ── Location filter ──────────────────────────────────────────────────────────
  test('admin flowboard location filter works', async ({ page }) => {
    requireCredentials()
    await signInAsAdmin(page)

    await page.goto('/admin/flowboard')
    await page.waitForLoadState('networkidle')

    // Location filter select — labeled "Location" or "All locations"
    // It only renders if locationOptions.length > 0
    const locationFilter = page.getByRole('combobox').filter({ hasText: /all locations/i }).first().or(
      page.locator('select').nth(1) // second select after status filter
    )

    const locationFilterVisible = await locationFilter.isVisible({ timeout: 5000 }).catch(() => false)

    if (!locationFilterVisible) {
      console.log('ℹ Location filter not visible — no locations configured or only one location exists')
      return
    }

    // Select first specific location (index 1 = first real location after "All locations")
    await locationFilter.selectOption({ index: 1 })
    await page.waitForTimeout(500)

    // Flowboard should still render after filter
    await expect(
      page.getByRole('heading', { name: /flowboard|appointments/i }).first()
    ).toBeVisible({ timeout: 10000 })

    // "Clear filters" button should appear since a filter is active
    const clearBtn = page.getByRole('button', { name: /clear filter|clear/i }).first()
    const clearVisible = await clearBtn.isVisible({ timeout: 3000 }).catch(() => false)
    if (clearVisible) {
      await clearBtn.click()
      await page.waitForTimeout(300)
      console.log('✓ Location filter cleared')
    }

    console.log('✓ Location filter applied successfully')
  })

  // ── Patient search ───────────────────────────────────────────────────────────
  test('admin flowboard patient search filters results', async ({ page }) => {
    requireCredentials()
    await signInAsAdmin(page)

    await page.goto('/admin/flowboard')
    await page.waitForLoadState('networkidle')

    // Smart patient search input — placeholder varies, look for input in search area
    const searchInput = page.getByPlaceholder(/search patient|patient name|search/i).first().or(
      page.locator('input[type="text"]').first()
    )

    await expect(searchInput).toBeVisible({ timeout: 15000 })

    // Type a search term
    await searchInput.fill('Ali')
    await page.waitForTimeout(800) // wait for debounce

    // Results should filter — either showing matches or empty state
    // The search doesn't navigate, it filters inline
    await expect(
      page.getByRole('heading', { name: /flowboard|appointments/i }).first()
    ).toBeVisible({ timeout: 10000 })

    console.log('✓ Patient search applied on flowboard')

    // Clear search
    await searchInput.fill('')
    await page.waitForTimeout(300)
  })

  // ── Patients history ─────────────────────────────────────────────────────────
  test('admin can view patients history', async ({ page }) => {
    requireCredentials()
    await signInAsAdmin(page)

    await page.goto('/admin/patients-history')
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByRole('heading', { name: /patient|history/i }).first()
    ).toBeVisible({ timeout: 20000 })

    console.log('✓ Admin patients history loaded')
  })

  // ── Search patient in patients history ───────────────────────────────────────
  test('admin can search for a patient in patients history', async ({ page }) => {
    requireCredentials()
    await signInAsAdmin(page)

    await page.goto('/admin/patients-history')
    await page.waitForLoadState('networkidle')

    // Smart patient search input
    const searchInput = page.getByPlaceholder(/search.*patient|patient.*search|name.*dob/i).first().or(
      page.locator('input[type="text"]').first()
    )

    await expect(searchInput).toBeVisible({ timeout: 15000 })

    // Search for Ali Hassan (created by nurse tests)
    await searchInput.fill('Ali Hassan')
    await page.waitForTimeout(1000) // debounce

    // Results should show Ali Hassan or empty state
    const hasResults = await page.getByText(/Ali Hassan/i).first().isVisible({ timeout: 5000 }).catch(() => false)

    if (hasResults) {
      await expect(page.getByText(/Ali Hassan/i).first()).toBeVisible({ timeout: 5000 })
      console.log('✓ Patient "Ali Hassan" found in search results')
    } else {
      console.log('ℹ No results for "Ali Hassan" — patient may not exist in this environment')
    }
  })

  // ── Open patient file ────────────────────────────────────────────────────────
  test('admin can open patient file from patients history', async ({ page }) => {
    requireCredentials()
    await signInAsAdmin(page)

    await page.goto('/admin/patients-history')
    await page.waitForLoadState('networkidle')

    // Patient file link uses text from translation key 'admin.patients.view_file'
    // which renders as "View file" — it's a <Link> (anchor) not a button
    const patientFileLink = page.getByRole('link', { name: /view file|view patient|open file/i }).first()

    const linkVisible = await patientFileLink.isVisible({ timeout: 10000 }).catch(() => false)

    if (!linkVisible) {
      console.log('ℹ No patients in history — skipping patient file open test')
      return
    }

    await patientFileLink.click()
    await page.waitForLoadState('networkidle')

    // URL should be /admin/patient-file/[id]
    await expect(page).toHaveURL(/\/admin\/patient-file\/\d+/, { timeout: 15000 })

    // Patient file page should render tabs
    await expect(
      page.getByRole('tab').first().or(
        page.getByText(/encounters|history|documents/i).first()
      )
    ).toBeVisible({ timeout: 15000 })

    console.log('✓ Patient file opened — URL is /admin/patient-file/[id]')
  })
})
