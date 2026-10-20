import { expect, test } from '@playwright/test'
import { signInAs, trackPageErrors, visit } from './helpers/auth'
import { mockJson } from './helpers/mock'

const SIDEBAR_LINKS = [
  'Overview',
  'Users',
  'Signups',
  'Audit Trail',
  'Locations',
  'Services',
  'Pharmacies',
  'Consent Forms',
  'Flowboard',
  'Appointments',
  'Prescription',
  'Patient History',
  'I-693 Forms',
  'Compliance',
  'Support Tickets',
  'Configurations',
  'Release Logs',
]

const STAT_CARDS: Array<[string, RegExp]> = [
  ['Staff users', /\/admin\/users$/],
  ['Patients', /\/admin\/patients-history$/],
  ['Appointments', /\/admin\/flowboard$/],
  ['Audit today', /\/admin\/audit$/],
  ['Pharmacies', /\/admin\/pharmacies$/],
]

const QUICK_ACCESS: Array<[string, RegExp]> = [
  ['User management', /\/admin\/users$/],
  ['Audit trail', /\/admin\/audit$/],
  ['Flowboard', /\/admin\/flowboard$/],
  ['Patient history', /\/admin\/patients-history$/],
  ['Pharmacies', /\/admin\/pharmacies$/],
  ['I-693 forms', /\/admin\/i-693$/],
]

test.describe('Admin — Overview', () => {
  test.setTimeout(180000)

  test('overview renders stats, quick access and activity sections', async ({ page }) => {
    const pageErrors = trackPageErrors(page)
    await signInAs(page, 'admin')
    const stats = page.waitForResponse(r => r.url().includes('/api/admin/stats'))
    await visit(page, '/admin')
    expect((await stats).ok()).toBeTruthy()

    await expect(page.getByRole('heading', { level: 1, name: 'Admin Overview' })).toBeVisible()
    for (const [label] of STAT_CARDS) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
    }
    for (const heading of ['Quick access', 'Locations', 'Recent activity', 'Recent logins']) {
      await expect(page.getByRole('heading', { level: 2, name: heading })).toBeVisible()
    }
    pageErrors.expectNone()
  })

  test('every sidebar link is present and opens its page', async ({ page }) => {
    test.setTimeout(300000)
    const pageErrors = trackPageErrors(page)
    await signInAs(page, 'admin')

    const hrefs: string[] = []
    for (const name of SIDEBAR_LINKS) {
      const link = page.getByRole('link', { name, exact: true }).first()
      await expect(link, name).toBeVisible()
      const href = await link.getAttribute('href')
      expect(href, name).toMatch(/^\/admin/)
      hrefs.push(href!)
    }
    // Load each target directly: the dev server compiles every route on first
    // hit, which makes a long chain of client-side clicks slow and flaky.
    for (const href of hrefs) {
      await visit(page, href)
      expect(new URL(page.url()).pathname, href).toBe(href)
      await expect(page.locator('h1').first(), `${href} heading`).toBeVisible({ timeout: 30000 })
    }
    pageErrors.expectNone()
  })

  for (const [label, target] of STAT_CARDS) {
    test(`stat card "${label}" links to its page`, async ({ page }) => {
      await signInAs(page, 'admin')
      await visit(page, '/admin')
      // Scope to <main>: the sidebar has links with the same labels.
      await page.getByRole('main').getByRole('link').filter({ hasText: label }).first().click()
      await page.waitForURL(target, { timeout: 30000 })
    })
  }

  for (const [title, target] of QUICK_ACCESS) {
    test(`quick access "${title}" links to its page`, async ({ page }) => {
      await signInAs(page, 'admin')
      await visit(page, '/admin')
      await page.getByRole('main').getByRole('link').filter({ has: page.getByRole('heading', { level: 3, name: title }) }).click()
      await page.waitForURL(target, { timeout: 30000 })
    })
  }

  test('pending prescriptions banner links to the queue', async ({ page }) => {
    await signInAs(page, 'admin')
    await mockJson(page, /\/api\/admin\/prescription-ready\?status=pending/, { rows: [], totalCount: 3, pharmacies: [], locations: [] }, { method: 'GET' })
    await visit(page, '/admin')

    const banner = page.getByRole('status').filter({ hasText: /pending prescription/ })
    await expect(banner).toBeVisible()
    await banner.getByRole('link', { name: 'Review now' }).click()
    await page.waitForURL(/\/admin\/prescriptions$/)
  })

  test('stats load failure shows an alert instead of crashing', async ({ page }) => {
    await signInAs(page, 'admin')
    await mockJson(page, '**/api/admin/stats', { error: 'Stats unavailable' }, { status: 500 })
    await visit(page, '/admin')
    await expect(page.getByRole('alert').filter({ hasText: 'Stats unavailable' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Admin Overview' })).toBeVisible()
  })
})
