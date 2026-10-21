import { expect, test } from '@playwright/test'
import { requireRole, signInAs, trackPageErrors, visit } from './helpers/auth'
import { acceptDialogs, dismissDialogs } from './helpers/mock'
import { isShown } from './helpers/wait'

/**
 * Clinic manager area (/manage). Everything is scoped to the manager's own
 * tenant, so writes run for real against that tenant and clean up after
 * themselves (forms are deleted, locations and staff are deactivated).
 * Staff emails use the playwright.user.* prefix that global-setup removes.
 */

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

test.describe('Clinic manager — shell', () => {
  test.setTimeout(120000)

  test('manager lands on Staff with tenant name and nav', async ({ page }) => {
    requireRole('manager')
    const pageErrors = trackPageErrors(page)
    const me = page.waitForResponse(r => r.url().endsWith('/api/manage/me'))
    await signInAs(page, 'manager')
    const meJson = (await (await me).json()) as { tenant?: { name?: string } }

    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
    if (meJson.tenant?.name) await expect(page.getByText(meJson.tenant.name).first()).toBeVisible()
    for (const [name, href] of [
      ['Dashboard', '/manage'],
      ['Staff', '/manage/staff'],
      ['Flowboard', '/manage/flowboard'],
      ['Patient history', '/manage/patients-history'],
      ['Support', '/manage/support'],
    ] as const) {
      await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute('href', href)
    }
    // Locations and consent forms are managed by MEMR admins, not here.
    await expect(page.getByRole('link', { name: 'Locations', exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Forms', exact: true })).toHaveCount(0)
    pageErrors.expectNone()
  })

  test('manager can sign out', async ({ page }) => {
    await signInAs(page, 'manager')
    await page.getByRole('button', { name: 'Sign Out' }).click()
    await page.waitForURL(url => url.pathname === '/' || url.pathname === '/login', { timeout: 30000 })
    // The redirect to /login aborts the original navigation, which goto reports as an error.
    await page.goto('/manage').catch(() => {})
    await page.waitForURL(/\/login/)
  })
})

test.describe('Clinic manager — Staff', () => {
  test.setTimeout(180000)

  test('add staff form validates role and location', async ({ page }) => {
    await signInAs(page, 'manager')
    await visit(page, '/manage/staff')
    let posted = false
    page.on('request', r => {
      if (r.url().endsWith('/api/manage/staff') && r.method() === 'POST') posted = true
    })

    await page.getByRole('button', { name: '+ Add staff' }).click()
    await page.getByPlaceholder('Full name').fill('Playwright Nobody')
    await page.getByPlaceholder('Email').fill(`playwright.user.${stamp()}@example.com`)
    await page.getByPlaceholder('Password').fill('Playwright!Aa1')
    await page.getByRole('button', { name: 'Add staff', exact: true }).click()

    await expect(page.getByText('Choose a role and at least one location.')).toBeVisible()
    expect(posted).toBe(false)
    await page.getByRole('button', { name: 'Cancel' }).click()
  })

  test('manager adds a nurse, edits, then deactivates them', async ({ page }) => {
    await signInAs(page, 'manager')
    await visit(page, '/manage/staff')
    const email = `playwright.user.${stamp()}@example.com`
    const name = `Playwright Staff ${stamp()}`

    await page.getByRole('button', { name: '+ Add staff' }).click()
    await page.getByPlaceholder('Full name').fill(name)
    await page.getByPlaceholder('Email').fill(email)
    await page.getByPlaceholder('Password').fill('Playwright!Aa1')
    await page.getByRole('radiogroup').getByRole('radio', { name: 'Nurse', exact: true }).click()
    await expect(page.getByRole('radio', { name: 'Nurse', exact: true })).toHaveAttribute('aria-checked', 'true')

    // Location chips sit in the add form; the language toggle also uses aria-pressed.
    const chip = page.locator('form button[aria-pressed]').first()
    test.skip(!(await isShown(chip, 10000)), 'Tenant has no locations.')
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'true')

    const created = page.waitForResponse(r => r.url().endsWith('/api/manage/staff') && r.request().method() === 'POST')
    await page.getByRole('button', { name: 'Add staff', exact: true }).click()
    expect((await created).ok()).toBeTruthy()
    await expect(page.getByText('Staff member added.')).toBeVisible()

    const card = page.locator('div').filter({ hasText: email }).filter({ has: page.getByRole('button', { name: 'Edit' }) }).last()
    await expect(card).toBeVisible()

    // Edit: rename
    await card.getByRole('button', { name: 'Edit' }).click()
    // In edit mode the card loses its Edit button, so address the form directly.
    // Resolve the form before typing: the value-based selector stops matching once edited.
    const editForm = page
      .locator('div')
      .filter({ has: page.locator(`input[value="${name}"]`) })
      .filter({ has: page.getByRole('button', { name: 'Save' }) })
      .last()
    const nameHandle = await page.locator(`input[value="${name}"]`).elementHandle()
    const saveHandle = await editForm.getByRole('button', { name: 'Save' }).elementHandle()
    await nameHandle!.fill(`${name} Edited`)
    const patched = page.waitForResponse(r => r.url().endsWith('/api/manage/staff') && r.request().method() === 'PATCH')
    await saveHandle!.click()
    expect((await patched).ok()).toBeTruthy()
    await expect(page.getByText('Changes saved.').first()).toBeVisible()

    // Deactivate (cleanup)
    const deactivated = page.waitForResponse(r => r.url().endsWith('/api/manage/staff') && r.request().method() === 'PATCH')
    await card.getByRole('button', { name: 'Deactivate' }).click()
    expect((await deactivated).ok()).toBeTruthy()
    await expect(card.getByText('Inactive')).toBeVisible()
    await expect(card.getByRole('button', { name: 'Activate' })).toBeVisible()
  })

  test('staff API rejects a weak password', async ({ page }) => {
    await signInAs(page, 'manager')
    await visit(page, '/manage/staff')
    const res = await page.request.post('/api/manage/staff', {
      data: { name: 'Weak', email: `playwright.user.${stamp()}@example.com`, password: 'weak', role: 'nurse', location_ids: [] },
    })
    expect(res.status()).toBeGreaterThanOrEqual(400)
    expect(res.status()).toBeLessThan(500)
  })

  test('staff API refuses admin as a role', async ({ page }) => {
    await signInAs(page, 'manager')
    await visit(page, '/manage/staff')
    const res = await page.request.post('/api/manage/staff', {
      data: { name: 'Escalate', email: `playwright.user.${stamp()}@example.com`, password: 'Playwright!Aa1', role: 'admin', location_ids: [1] },
    })
    expect(res.status()).toBeGreaterThanOrEqual(400)
    expect(res.status()).toBeLessThan(500)
  })
})

test.describe('Clinic manager — no locations or forms', () => {
  test('the removed pages and APIs are gone', async ({ page }) => {
    await signInAs(page, 'manager')
    for (const path of ['/api/manage/locations', '/api/manage/forms']) {
      const res = await page.request.get(path)
      expect(res.status(), path).toBe(404)
    }
  })
})

test.describe('Clinic manager — read-only views', () => {
  test.setTimeout(120000)
  test.beforeEach(() => requireRole('manager'))

  test('dashboard loads the tenant numbers', async ({ page }) => {
    const stats = page.waitForResponse(r => r.url().endsWith('/api/manage/stats'))
    await signInAs(page, 'manager')
    expect((await stats).status()).toBe(200)
    await expect(page.getByText('Recent logins')).toBeVisible()
  })

  test('flowboard and patient history open nothing clinical', async ({ page }) => {
    await signInAs(page, 'manager')
    await visit(page, '/manage/flowboard')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('button', { name: 'View', exact: true })).toHaveCount(0)

    await visit(page, '/manage/patients-history')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: /view file/i })).toHaveCount(0)
  })

  test('support inbox is read-only', async ({ page }) => {
    await signInAs(page, 'manager')
    await visit(page, '/manage/support')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const res = await page.request.patch('/api/support/tickets/00000000-0000-4000-8000-000000000000', {
      data: { status: 'resolved' },
    })
    expect([403, 404]).toContain(res.status())
  })

  test('manager APIs answer for the tenant', async ({ page }) => {
    await signInAs(page, 'manager')
    for (const path of ['/api/manage/stats', '/api/manage/flowboard', '/api/manage/patients-history']) {
      const res = await page.request.get(path)
      expect(res.status(), path).toBe(200)
    }
  })
})
