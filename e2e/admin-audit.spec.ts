import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { signInAs, trackPageErrors, visit } from './helpers/auth'
import { isShown } from './helpers/wait'

// The audit list is a CSS grid of divs, not a <table>.
const headerRow = (page: Page) => page.locator('div.grid-cols-12.bg-slate-50')
const eventRows = (page: Page) => page.locator('div.grid-cols-12.cursor-pointer')

test.describe('Admin — Audit Trail', () => {
  test.setTimeout(120000)

  test('audit trail loads with table headers and events', async ({ page }) => {
    const pageErrors = trackPageErrors(page)
    await signInAs(page, 'admin')

    const auditRes = page.waitForResponse(r => r.url().includes('/api/admin/audit') && r.ok())
    await visit(page, '/admin/audit')
    await auditRes

    await expect(page.getByRole('heading', { level: 1, name: 'Audit Trail' })).toBeVisible()
    await expect(page.getByText(/total events/i)).toBeVisible()
    for (const header of ['Time', 'User', 'Role', 'Action', 'Resource', 'Page / URL', 'IP']) {
      await expect(headerRow(page).getByText(header, { exact: true })).toBeVisible()
    }
    // Signing in itself writes audit rows, so the table is never empty here.
    await expect(eventRows(page).first()).toBeVisible({ timeout: 20000 })
    pageErrors.expectNone()
  })

  test('search filter is sent to the API and clear resets it', async ({ page }) => {
    await signInAs(page, 'admin')
    await visit(page, '/admin/audit')

    const searched = page.waitForResponse(
      r => r.url().includes('/api/admin/audit') && r.url().includes('search=login')
    )
    await page.getByPlaceholder('Search user, action, resource…').fill('login')
    expect((await searched).ok()).toBeTruthy()

    const clear = page.getByRole('button', { name: 'Clear' })
    await expect(clear).toBeVisible()
    await clear.click()
    await expect(page.getByPlaceholder('Search user, action, resource…')).toHaveValue('')
    await expect(clear).toBeHidden()
  })

  test('role filter narrows events to the chosen role', async ({ page }) => {
    await signInAs(page, 'admin')
    await visit(page, '/admin/audit')

    const roleSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'All roles' }) })
    await expect(roleSelect).toBeVisible({ timeout: 20000 })
    const filtered = page.waitForResponse(r => r.url().includes('/api/admin/audit') && r.url().includes('role=admin'))
    await roleSelect.selectOption({ label: 'Admin' })
    expect((await filtered).ok()).toBeTruthy()

    const rows = eventRows(page)
    const count = await rows.count()
    for (let i = 0; i < Math.min(count, 10); i++) {
      const text = await rows.nth(i).innerText()
      if (/No audit events/i.test(text)) break
      expect(text).toMatch(/admin/i)
    }
  })

  test('date range filter sends from/to and future range is empty', async ({ page }) => {
    await signInAs(page, 'admin')
    await visit(page, '/admin/audit')

    await page.getByLabel('From date').fill('2099-01-01')
    const filtered = page.waitForResponse(
      r => r.url().includes('/api/admin/audit') && r.url().includes('to=2099-01-02')
    )
    await page.getByLabel('To date').fill('2099-01-02')
    expect((await filtered).ok()).toBeTruthy()
    await expect(page.getByText('No audit events match your filters.')).toBeVisible({ timeout: 15000 })
  })

  test('action filter lists actions and filters by one', async ({ page }) => {
    await signInAs(page, 'admin')
    await visit(page, '/admin/audit')

    const actionSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'All actions' }) })
    await expect(actionSelect).toBeVisible({ timeout: 20000 })
    expect(await actionSelect.locator('option').count()).toBeGreaterThan(1)

    const filtered = page.waitForResponse(r => r.url().includes('/api/admin/audit') && /[?&]action=[^&]+/.test(r.url()))
    await actionSelect.selectOption({ index: 1 })
    expect((await filtered).ok()).toBeTruthy()
  })

  test('clicking a row expands event details', async ({ page }) => {
    await signInAs(page, 'admin')
    await visit(page, '/admin/audit')

    const firstRow = eventRows(page).first()
    await expect(firstRow).toBeVisible({ timeout: 20000 })
    await firstRow.click()
    await expect(page.getByText('User-agent:').first()).toBeVisible()
  })

  test('refresh refetches and live mode polls', async ({ page }) => {
    await signInAs(page, 'admin')
    await visit(page, '/admin/audit')

    const refreshed = page.waitForResponse(r => r.url().includes('/api/admin/audit'))
    await page.getByRole('button', { name: 'Refresh' }).click()
    expect((await refreshed).ok()).toBeTruthy()

    await page.getByText('Live', { exact: true }).click()
    // Live polls every 5s — two more requests prove the interval is running.
    let polls = 0
    page.on('response', r => {
      if (r.url().includes('/api/admin/audit')) polls++
    })
    await expect.poll(() => polls, { timeout: 15000 }).toBeGreaterThanOrEqual(2)
  })

  test('pagination moves between pages when there are more than 50 events', async ({ page }) => {
    await signInAs(page, 'admin')
    await visit(page, '/admin/audit')

    const next = page.getByRole('button', { name: 'Next' })
    test.skip(!(await isShown(next, 10000)), 'Fewer than 50 audit events.')
    const paged = page.waitForResponse(r => r.url().includes('/api/admin/audit') && r.url().includes('page=2'))
    await next.click()
    expect((await paged).ok()).toBeTruthy()
    await expect(page.getByText(/Showing 51–/)).toBeVisible()
  })
})
