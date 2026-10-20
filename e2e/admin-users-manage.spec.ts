import { expect, test, type Page } from '@playwright/test'
import { signInAs, visit } from './helpers/auth'
import { dismissDialogs, mockJson } from './helpers/mock'
import { isShown } from './helpers/wait'

/**
 * Covers the users list and every row modal. Create + login is in
 * admin-user-create-login.spec.ts. Mutations against existing accounts are
 * mocked so shared test users keep their passwords, roles and locations.
 */

// The users list is a CSS grid of divs, not a <table>.
const headerRow = (page: Page) => page.locator('div.grid-cols-12.bg-slate-50')
const userRows = (page: Page) => page.locator('div.grid-cols-12:not(.bg-slate-50)')
// The reset-password label isn't tied to its input; scope to the modal form.
const resetForm = (page: Page) => page.locator('form').filter({ hasText: 'Set a new password for' })

test.describe('Admin — Users management', () => {
  test.setTimeout(120000)

  test('users list loads with headers and data-testid root', async ({ page }) => {
    await signInAs(page, 'admin')
    await visit(page, '/admin/users')

    await expect(page.getByTestId('admin-users-page')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Clinical Accounts' })).toBeVisible()
    for (const header of ['Name', 'Email', 'Role', 'Locations', 'Actions']) {
      await expect(headerRow(page).getByText(header, { exact: true })).toBeVisible()
    }
  })

  test('search narrows rows and unknown term shows empty state', async ({ page }) => {
    await signInAs(page, 'admin')
    await visit(page, '/admin/users')

    await page.getByPlaceholder('Search by name or email…').fill('zzz-no-such-user-zzz@nowhere')
    await expect(page.getByText('No accounts found')).toBeVisible()
  })

  test('role filter shows only that role', async ({ page }) => {
    await signInAs(page, 'admin')
    await visit(page, '/admin/users')

    const roleSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'All roles' }) })
    await roleSelect.selectOption({ label: 'Nurse' })
    const rows = userRows(page)
    const n = await rows.count()
    for (let i = 0; i < Math.min(n, 20); i++) {
      const text = await rows.nth(i).innerText()
      if (/No accounts found/.test(text)) break
      expect(text).toMatch(/Nurse/)
    }
  })

  test('show inactive toggle hides inactive accounts', async ({ page }) => {
    await signInAs(page, 'admin')
    await visit(page, '/admin/users')

    const toggle = page.getByLabel('Show inactive')
    await expect(toggle).toBeChecked()
    await toggle.uncheck()
    await expect(userRows(page).filter({ hasText: 'Inactive' })).toHaveCount(0)
  })

  test('create modal rejects a weak password', async ({ page }) => {
    await signInAs(page, 'admin')
    await visit(page, '/admin/users')

    await page.getByTestId('admin-users-create-button').click()
    const modal = page.getByTestId('admin-users-create-modal')
    await expect(modal).toBeVisible()
    await page.getByTestId('admin-users-name-input').fill('Playwright Weak')
    await page.getByTestId('admin-users-email-input').fill('playwright.user.weak@example.com')
    await page.getByTestId('admin-users-password-input').fill('weak')
    await page.getByTestId('admin-create-user-role-nurse').click()

    // The client doesn't pre-validate; the API must refuse and nothing is created.
    const created = page.waitForResponse(r => r.url().endsWith('/api/admin/users') && r.request().method() === 'POST')
    await page.getByTestId('admin-users-submit-button').click()
    const res = await created
    expect(res.status()).toBeGreaterThanOrEqual(400)
    expect(res.status()).toBeLessThan(500)
    await expect(modal).toBeVisible()
    await expect(page.getByTestId('admin-users-create-success')).toHaveCount(0)
  })

  test('create modal location picker search and select all', async ({ page }) => {
    await signInAs(page, 'admin')
    await visit(page, '/admin/users')
    await page.getByTestId('admin-users-create-button').click()
    const modal = page.getByTestId('admin-users-create-modal')

    const selectAll = modal.getByRole('button', { name: 'Select all clinics' })
    test.skip(!(await isShown(selectAll, 10000)), 'No clinic locations configured.')
    await selectAll.click()
    const counter = modal.getByText(/(\d+) of (\d+) selected/)
    const [, selected, total] = (await counter.innerText()).match(/(\d+) of (\d+) selected/) ?? []
    expect(selected).toBe(total)

    await modal.getByPlaceholder('Search clinics…').fill('zzz-no-such-clinic-zzz')
    await expect(modal.getByText('No clinics match your search.')).toBeVisible()
  })

  test('doctor role exposes the compliance access checkbox', async ({ page }) => {
    await signInAs(page, 'admin')
    await visit(page, '/admin/users')
    await page.getByTestId('admin-users-create-button').click()
    const modal = page.getByTestId('admin-users-create-modal')

    await page.getByTestId('admin-create-user-role-nurse').click()
    await expect(modal.getByText('Compliance dashboard access')).toBeHidden()
    await page.getByTestId('admin-create-user-role-doctor').click()
    await expect(modal.getByText('Compliance dashboard access')).toBeVisible()
    await modal.getByRole('button', { name: 'Cancel' }).click()
    await expect(modal).toBeHidden()
  })

  test('edit modal opens prefilled and save sends PATCH with uid', async ({ page }) => {
    await signInAs(page, 'admin')
    const patches = await mockJson(page, '**/api/admin/users', { success: true }, { method: 'PATCH' })
    await visit(page, '/admin/users')

    await page.getByRole('button', { name: 'Edit', exact: true }).first().click()
    await expect(page.getByRole('heading', { level: 2, name: 'Edit user' })).toBeVisible()
    await expect(page.getByLabel('Active account')).toBeVisible()
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    await expect.poll(() => patches.length).toBe(1)
    expect((patches[0]!.postDataJSON() as { uid?: string }).uid).toBeTruthy()
  })

  test('reset password modal toggles visibility and cancels', async ({ page }) => {
    await signInAs(page, 'admin')
    const patches = await mockJson(page, '**/api/admin/users', {}, { method: 'PATCH' })
    await visit(page, '/admin/users')

    await page.getByRole('button', { name: 'Reset password' }).first().click()
    await expect(page.getByRole('heading', { level: 2, name: 'Reset password' })).toBeVisible()
    const input = resetForm(page).locator('input')
    await input.fill('Playwright!Aa1')
    await expect(input).toHaveAttribute('type', 'password')
    await resetForm(page).getByRole('button', { name: 'Show' }).click()
    await expect(input).toHaveAttribute('type', 'text')
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Reset password' })).toBeHidden()
    expect(patches).toHaveLength(0)
  })

  test('reset password submit sends PATCH (mocked)', async ({ page }) => {
    await signInAs(page, 'admin')
    const patches = await mockJson(page, '**/api/admin/users', { success: true }, { method: 'PATCH' })
    await visit(page, '/admin/users')

    await page.getByRole('button', { name: 'Reset password' }).first().click()
    await resetForm(page).locator('input').fill('Playwright!Aa1Reset')
    await resetForm(page).getByRole('button', { name: 'Reset password' }).click()
    await expect.poll(() => patches.length).toBe(1)
    expect(JSON.stringify(patches[0]!.postDataJSON())).toContain('Playwright!Aa1Reset')
  })

  test('change locations modal opens and save sends PATCH (mocked)', async ({ page }) => {
    await signInAs(page, 'admin')
    const patches = await mockJson(page, '**/api/admin/users', { success: true }, { method: 'PATCH' })
    await visit(page, '/admin/users')

    await page.getByRole('button', { name: 'Change locations' }).first().click()
    await expect(page.getByRole('heading', { level: 2, name: 'Change locations' })).toBeVisible()
    await page.getByRole('button', { name: 'Save locations' }).click()
    await expect.poll(() => patches.length).toBe(1)
  })

  test('dismissing soft delete confirm sends nothing', async ({ page }) => {
    await signInAs(page, 'admin')
    const dialogs = dismissDialogs(page)
    const deletes = await mockJson(page, '**/api/admin/users', {}, { method: 'DELETE' })
    await visit(page, '/admin/users')

    await page.getByRole('button', { name: 'Delete', exact: true }).first().click()
    await expect.poll(() => dialogs.length).toBe(1)
    expect(dialogs[0]).toMatch(/^Soft delete /)
    expect(deletes).toHaveLength(0)
  })

  test('pagination moves through pages of 20', async ({ page }) => {
    await signInAs(page, 'admin')
    await visit(page, '/admin/users')

    const next = page.getByRole('button', { name: 'Next' })
    test.skip(!(await next.isEnabled().catch(() => false)), 'Twenty or fewer accounts.')
    await next.click()
    await expect(page.getByText(/Showing 21–/)).toBeVisible()
    await page.getByRole('button', { name: 'Previous' }).click()
    await expect(page.getByText(/Showing 1–/)).toBeVisible()
  })
})
