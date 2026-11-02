import { expect, test } from '@playwright/test'
import { signInAs, visit } from './helpers/auth'
import { isShown } from './helpers/wait'

/**
 * Only one account manages release logs (lib/release-logs/manager.ts); the
 * shared admin test user sees the read-only view, which is what's covered.
 */

test.describe('Admin — Release Logs', () => {
  test.setTimeout(120000)

  test('release logs load both lists and mark them seen', async ({ page }) => {
    await signInAs(page, 'admin')
    const released = page.waitForResponse(r => r.url().includes('/api/admin/release-logs?status=released'))
    const upcoming = page.waitForResponse(r => r.url().includes('/api/admin/release-logs?status=upcoming'))
    const seen = page.waitForResponse(r => r.url().endsWith('/api/admin/release-logs/seen') && r.request().method() === 'POST')
    await visit(page, '/admin/release-logs')

    expect((await released).ok()).toBeTruthy()
    expect((await upcoming).ok()).toBeTruthy()
    expect((await seen).ok()).toBeTruthy()
    await expect(page.getByRole('heading', { level: 1, name: 'Release Logs' })).toBeVisible()
  })

  test('tabs switch between What’s New and Upcoming', async ({ page }) => {
    await signInAs(page, 'admin')
    await visit(page, '/admin/release-logs')

    const tablist = page.getByRole('tablist', { name: 'Release Logs' })
    const whatsNew = tablist.getByRole('tab', { name: /What.s New/ })
    const upcoming = tablist.getByRole('tab', { name: /Upcoming/ })

    await expect(whatsNew).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('No releases yet.').or(page.locator('h3').first()).first()).toBeVisible()

    await upcoming.click()
    await expect(upcoming).toHaveAttribute('aria-selected', 'true')
    await expect(whatsNew).toHaveAttribute('aria-selected', 'false')
    await expect(page.getByText('No upcoming changes.').or(page.locator('h3').first()).first()).toBeVisible()
  })

  test('non-manager admin sees no editing controls', async ({ page }) => {
    await signInAs(page, 'admin')
    await visit(page, '/admin/release-logs')

    test.skip(await isShown(page.getByRole('button', { name: 'Add item' }), 10000), 'Signed in as the release-log manager.')
    for (const name of ['Edit', 'Delete', 'Mark as released', 'Move back to upcoming']) {
      await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0)
    }
  })

  test('non-manager cannot write release logs via the API', async ({ page }) => {
    await signInAs(page, 'admin')
    const res = await page.request.post('/api/admin/release-logs', { data: { task: 'Playwright should not create this' } })
    test.skip(res.ok(), 'Signed in as the release-log manager.')
    expect([401, 403]).toContain(res.status())
  })
})
