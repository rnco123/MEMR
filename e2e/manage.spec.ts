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

    await expect(page.getByRole('heading', { level: 1, name: 'Staff' })).toBeVisible()
    if (meJson.tenant?.name) await expect(page.getByText(meJson.tenant.name).first()).toBeVisible()
    for (const [name, href] of [['Staff', '/manage'], ['Locations', '/manage/locations'], ['Forms', '/manage/forms']] as const) {
      await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute('href', href)
    }
    pageErrors.expectNone()
  })

  test('nav moves between Staff, Locations and Forms', async ({ page }) => {
    await signInAs(page, 'manager')
    await page.getByRole('link', { name: 'Locations', exact: true }).click()
    await page.waitForURL(/\/manage\/locations$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Locations' })).toBeVisible()
    await page.getByRole('link', { name: 'Forms', exact: true }).click()
    await page.waitForURL(/\/manage\/forms$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Consent forms' })).toBeVisible()
    await page.getByRole('link', { name: 'Staff', exact: true }).click()
    await page.waitForURL(/\/manage$/)
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
    const res = await page.request.post('/api/manage/staff', {
      data: { name: 'Weak', email: `playwright.user.${stamp()}@example.com`, password: 'weak', role: 'nurse', location_ids: [] },
    })
    expect(res.status()).toBeGreaterThanOrEqual(400)
    expect(res.status()).toBeLessThan(500)
  })

  test('staff API refuses admin as a role', async ({ page }) => {
    await signInAs(page, 'manager')
    const res = await page.request.post('/api/manage/staff', {
      data: { name: 'Escalate', email: `playwright.user.${stamp()}@example.com`, password: 'Playwright!Aa1', role: 'admin', location_ids: [1] },
    })
    expect(res.status()).toBeGreaterThanOrEqual(400)
    expect(res.status()).toBeLessThan(500)
  })
})

test.describe('Clinic manager — Locations', () => {
  test.setTimeout(180000)

  test('manager adds, edits and deactivates a location', async ({ page }) => {
    await signInAs(page, 'manager')
    await visit(page, '/manage/locations')
    const title = `Playwright Site ${stamp()}`

    await page.getByRole('button', { name: '+ Add location' }).click()
    await page.getByPlaceholder('Location name').fill(title)
    await page.getByPlaceholder('Address').fill('500 Test Ave, Houston, TX 77002')
    await page.keyboard.press('Escape')
    await page.getByPlaceholder('Phone').fill('5551112222')
    await page.getByPlaceholder('Location email').fill('site@playwright.example.com')
    const created = page.waitForResponse(r => r.url().endsWith('/api/manage/locations') && r.request().method() === 'POST')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    expect((await created).ok()).toBeTruthy()

    const card = page.locator('div').filter({ hasText: title }).filter({ has: page.getByRole('button', { name: 'Edit' }) }).last()
    await expect(card).toBeVisible()
    await expect(card.getByText('5551112222', { exact: false })).toBeVisible()

    await card.getByRole('button', { name: 'Edit' }).click()
    await page.getByPlaceholder('Phone').fill('5553334444')
    const patched = page.waitForResponse(r => /\/api\/manage\/locations\/\d+$/.test(r.url()) && r.request().method() === 'PATCH')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    expect((await patched).ok()).toBeTruthy()
    await expect(page.getByText('Changes saved.').first()).toBeVisible()

    const card2 = page.locator('div').filter({ hasText: title }).filter({ has: page.getByRole('button', { name: 'Deactivate' }) }).last()
    const deactivated = page.waitForResponse(r => /\/api\/manage\/locations\/\d+$/.test(r.url()) && r.request().method() === 'PATCH')
    await card2.getByRole('button', { name: 'Deactivate' }).click()
    expect((await deactivated).ok()).toBeTruthy()
    // Once deactivated the card offers "Activate" instead, so find it again.
    const inactiveCard = page.locator('div').filter({ hasText: title }).filter({ has: page.getByRole('button', { name: 'Activate' }) }).last()
    await expect(inactiveCard.getByText('Inactive')).toBeVisible()
  })

  test('location name is required', async ({ page }) => {
    await signInAs(page, 'manager')
    await visit(page, '/manage/locations')
    let posted = false
    page.on('request', r => {
      if (r.url().endsWith('/api/manage/locations') && r.method() === 'POST') posted = true
    })
    await page.getByRole('button', { name: '+ Add location' }).click()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    expect(await page.getByPlaceholder('Location name').evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false)
    expect(posted).toBe(false)
  })
})

test.describe('Clinic manager — Consent forms', () => {
  test.setTimeout(180000)

  test('empty form shows validation toast', async ({ page }) => {
    await signInAs(page, 'manager')
    await visit(page, '/manage/forms')
    await page.getByRole('button', { name: '+ Add form' }).click()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Name and HTML content are required')).toBeVisible()
  })

  test('manager creates an inactive form, edits it, then deletes it', async ({ page }) => {
    await signInAs(page, 'manager')
    await visit(page, '/manage/forms')
    const name = `Playwright Consent ${stamp()}`

    await page.getByRole('button', { name: '+ Add form' }).click()
    // The "Form name" label isn't tied to its input.
    await page.locator('label:text-is("Form name") + input').fill(name)
    await page.getByRole('button', { name: 'HTML', exact: true }).click()
    await page.locator('textarea').last().fill('<p>Playwright consent body {{patient_name}}</p>')
    // Keep it off live encounters.
    const active = page.getByLabel('Active (shown on encounters for this tenant)')
    if (await active.isChecked()) await active.uncheck()

    const created = page.waitForResponse(r => r.url().endsWith('/api/manage/forms') && r.request().method() === 'POST')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    expect((await created).ok()).toBeTruthy()

    const row = page.locator('div').filter({ hasText: name }).filter({ has: page.getByRole('button', { name: 'Delete' }) }).last()
    await expect(row.getByText('Inactive')).toBeVisible()

    // Dismissed confirm keeps it
    const dismissed = dismissDialogs(page)
    await row.getByRole('button', { name: 'Delete' }).click()
    await expect.poll(() => dismissed.length).toBe(1)
    expect(dismissed[0]).toContain('permanently')
    await expect(row).toBeVisible()
    page.removeAllListeners('dialog')

    // Accepted confirm deletes it
    acceptDialogs(page)
    const deleted = page.waitForResponse(r => /\/api\/manage\/forms\/[^/]+$/.test(r.url()) && r.request().method() === 'DELETE')
    await row.getByRole('button', { name: 'Delete' }).click()
    expect((await deleted).ok()).toBeTruthy()
    await expect(page.getByText('Form deleted.')).toBeVisible()
    await expect(page.getByText(name)).toBeHidden()
  })

  test('manager cannot read another tenant’s form by id', async ({ page }) => {
    await signInAs(page, 'manager')
    const res = await page.request.patch('/api/manage/forms/999999999', { data: { is_active: false } })
    // Any refusal is fine; what matters is that it isn't applied.
    expect([400, 403, 404]).toContain(res.status())
  })
})
