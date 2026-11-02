import { expect, test, type Page } from '@playwright/test'
import { signInAs, visit } from './helpers/auth'
import { isShown } from './helpers/wait'

/**
 * Saving changes which services are live on the patient Portal and the EMR,
 * so PUTs are intercepted; every other request hits the real API.
 */

async function openFirstLocation(page: Page) {
  const loaded = page.waitForResponse(r => r.url().includes('/api/admin/configurations') && r.request().method() === 'GET')
  await visit(page, '/admin/configurations')
  expect((await loaded).ok()).toBeTruthy()
  await expect(page.getByRole('heading', { level: 1, name: 'Configurations' })).toBeVisible()

  const firstLocation = page.getByRole('button').filter({ hasText: /\d+ services/ }).first()
  test.skip(!(await isShown(firstLocation, 15000)), 'No locations configured.')
  await firstLocation.click()
  await expect(page.getByText(/\d+ of \d+ services assigned/)).toBeVisible()
}

test.describe('Admin — Configurations', () => {
  test.setTimeout(120000)

  test('page loads with tabs, location list and disabled save', async ({ page }) => {
    await signInAs(page, 'admin')
    await visit(page, '/admin/configurations')

    const tabs = page.getByRole('navigation', { name: 'Configurations' })
    await expect(tabs.getByRole('button', { name: 'Location services' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('heading', { level: 2, name: 'Clinic locations' })).toBeVisible()
    await expect(page.getByText(/\d+ of \d+ configured/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Discard changes' })).toBeDisabled()
  })

  test('location search narrows the list and no-match shows empty state', async ({ page }) => {
    await signInAs(page, 'admin')
    await visit(page, '/admin/configurations')

    await page.getByPlaceholder('Search locations…').fill('zzz-no-such-location-zzz')
    await expect(page.getByText('No locations match your filters.')).toBeVisible()
  })

  test('tenant filter lists tenants', async ({ page }) => {
    await signInAs(page, 'admin')
    await visit(page, '/admin/configurations')

    const tenantSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'All tenants' }) })
    const count = await tenantSelect.locator('option').count()
    test.skip(count < 2, 'No tenants.')
    await tenantSelect.selectOption({ index: 1 })
    await expect(tenantSelect).not.toHaveValue('')
  })

  test('selecting a location shows its services with Portal/EMR toggles', async ({ page }) => {
    await signInAs(page, 'admin')
    await openFirstLocation(page)

    for (const name of ['Portal', 'EMR']) {
      await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', /true|false/)
    }
    await expect(page.getByPlaceholder('Search services…')).toBeVisible()
    await expect(page.getByRole('checkbox').first()).toBeVisible()
  })

  test('service filter shows assigned / unassigned only', async ({ page }) => {
    await signInAs(page, 'admin')
    await openFirstLocation(page)

    const filter = page.locator('select').filter({ has: page.locator('option', { hasText: 'Assigned only' }) })
    await filter.selectOption({ label: 'Assigned only' })
    const assigned = page.getByRole('checkbox')
    for (const box of await assigned.all()) await expect(box).toBeChecked()

    await filter.selectOption({ label: 'Unassigned only' })
    for (const box of await page.getByRole('checkbox').all()) await expect(box).not.toBeChecked()
  })

  test('toggling a service marks unsaved and discard reverts', async ({ page }) => {
    await signInAs(page, 'admin')
    await openFirstLocation(page)

    const box = page.getByRole('checkbox').first()
    const before = await box.isChecked()
    await box.click()
    await expect(page.getByText('Unsaved changes')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeEnabled()

    await page.getByRole('button', { name: 'Discard changes' }).click()
    await expect(page.getByText('Changes discarded')).toBeVisible()
    await expect(page.getByText('Unsaved changes')).toBeHidden()
    expect(await box.isChecked()).toBe(before)
  })

  test('save sends a PUT for the changed location', async ({ page }) => {
    await signInAs(page, 'admin')
    const puts: string[] = []
    await page.route(/\/api\/admin\/configurations\/\d+$/, async route => {
      if (route.request().method() !== 'PUT') return route.fallback()
      puts.push(route.request().url())
      // Client reads body.data as the saved row, so echo the request back.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: route.request().postDataJSON() }),
      })
    })
    await openFirstLocation(page)

    await page.getByRole('checkbox').first().click()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Configurations saved')).toBeVisible()
    expect(puts).toHaveLength(1)
  })

  test('save failure shows an error and keeps changes', async ({ page }) => {
    await signInAs(page, 'admin')
    await page.route(/\/api\/admin\/configurations\/\d+$/, route =>
      route.request().method() === 'PUT'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' })
        : route.fallback()
    )
    await openFirstLocation(page)

    await page.getByRole('checkbox').first().click()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Could not save configurations')).toBeVisible()
    await expect(page.getByText('Unsaved changes')).toBeVisible()
  })

  test('apply to listed / clear listed bulk toggle services', async ({ page }) => {
    await signInAs(page, 'admin')
    await openFirstLocation(page)

    await page.getByRole('button', { name: 'Apply to listed' }).click()
    for (const box of await page.getByRole('checkbox').all()) await expect(box).toBeChecked()
    await page.getByRole('button', { name: 'Clear listed' }).click()
    for (const box of await page.getByRole('checkbox').all()) await expect(box).not.toBeChecked()
    await page.getByRole('button', { name: 'Discard changes' }).click()
  })

  test('tenant colors tab sets a hex color and resets it', async ({ page }) => {
    await signInAs(page, 'admin')
    await visit(page, '/admin/configurations')

    await page.getByRole('navigation', { name: 'Configurations' }).getByRole('button', { name: 'Tenant colors' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Tenant colors' })).toBeVisible()

    const hex = page.getByLabel('Hex color').first()
    test.skip(!(await isShown(hex, 10000)), 'No tenants found.')
    const original = await hex.inputValue()
    await hex.fill('#123456')
    await hex.blur()
    await expect(hex).toHaveValue(/#?123456/i)

    await page.getByRole('button', { name: 'Reset' }).first().click()
    await expect(hex).not.toHaveValue(/#?123456/i)
    void original
  })
})
