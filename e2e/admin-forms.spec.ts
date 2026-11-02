import { expect, test, type Page } from '@playwright/test'
import { signInAs, visit } from './helpers/auth'
import { acceptDialogs, dismissDialogs } from './helpers/mock'
import { isShown } from './helpers/wait'

/**
 * Consent form templates per tenant. Test forms are created inactive (never
 * shown on encounters) and deleted at the end of each test.
 */

async function openForms(page: Page) {
  await signInAs(page, 'admin')
  const tenants = page.waitForResponse(r => r.url().endsWith('/api/admin/tenants'))
  await visit(page, '/admin/forms')
  expect((await tenants).ok()).toBeTruthy()
  await expect(page.getByRole('heading', { level: 1, name: 'Consent form templates' })).toBeVisible()
  const tenant = page.getByLabel('Tenant')
  test.skip((await tenant.locator('option').count()) === 0, 'No tenants.')
  return tenant
}

async function startCreateNew(page: Page) {
  await page.getByRole('button', { name: 'Add form' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'How would you like to add a form?' })).toBeVisible()
  await page.getByText('Create new', { exact: true }).click()
}

test.describe('Admin — Consent form templates', () => {
  test.setTimeout(180000)

  test('tenant picker loads forms for the selected tenant', async ({ page }) => {
    const tenant = await openForms(page)
    const count = await tenant.locator('option').count()
    test.skip(count < 2, 'Only one tenant.')
    const value = await tenant.locator('option').nth(1).getAttribute('value')
    const res = page.waitForResponse(r => r.url().includes(`/api/admin/forms?tenant_id=${value}`))
    await tenant.selectOption({ index: 1 })
    expect((await res).ok()).toBeTruthy()
    await expect(page.getByText(/No forms for .+ yet\./).or(page.getByRole('heading', { level: 3 }).first()).first()).toBeVisible()
  })

  test('add form panel offers create-new and copy-existing', async ({ page }) => {
    await openForms(page)
    await page.getByRole('button', { name: 'Add form' }).click()
    await expect(page.getByText('Create new', { exact: true })).toBeVisible()
    await expect(page.getByText('Choose from existing', { exact: true })).toBeVisible()

    await page.getByText('Choose from existing', { exact: true }).click()
    await expect(page.getByText(/Form coverage for/).or(page.getByText(/No forms (exist yet|from other tenants)/)).first()).toBeVisible()
    await page.getByText('← How would you like to add a form?').click()
    await expect(page.getByText('Create new', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Cancel' }).first().click()
    await expect(page.getByText('Create new', { exact: true })).toBeHidden()
  })

  test('create requires name and HTML content', async ({ page }) => {
    await openForms(page)
    await startCreateNew(page)
    await page.getByRole('button', { name: 'Create form' }).click()
    await expect(page.getByText('Name and HTML content are required').or(page.locator(':invalid').first()).first()).toBeVisible()
  })

  test('editor switches between Visual and HTML and inserts dynamic fields', async ({ page }) => {
    await openForms(page)
    await startCreateNew(page)
    await expect(page.getByRole('button', { name: 'Visual' })).toBeVisible()
    for (const title of ['Bold', 'Italic', 'Bullet list', 'Numbered list']) {
      await expect(page.getByTitle(title)).toBeVisible()
    }
    const insert = page.locator('select').filter({ has: page.locator('option', { hasText: 'Insert dynamic field…' }) })
    expect(await insert.locator('option').count()).toBeGreaterThan(1)

    await page.getByRole('button', { name: 'HTML', exact: true }).click()
    await expect(page.locator('textarea').last()).toBeVisible()
  })

  test('create → edit → deactivate guard → delete round trip', async ({ page }) => {
    await openForms(page)
    const name = `Playwright Template ${Date.now()}`
    await startCreateNew(page)

    await page.getByLabel('Form name').fill(name)
    const active = page.getByLabel('Active (shown on encounters for this tenant)')
    if (await active.isChecked()) await active.uncheck()
    await page.getByRole('button', { name: 'HTML', exact: true }).click()
    await page.locator('textarea').last().fill('<p>Playwright template body</p>')

    const created = page.waitForResponse(r => r.url().endsWith('/api/admin/forms') && r.request().method() === 'POST')
    await page.getByRole('button', { name: 'Create form' }).click()
    const createdRes = await created
    expect(createdRes.ok()).toBeTruthy()
    expect((createdRes.request().postDataJSON() as { is_active?: boolean }).is_active).toBe(false)
    await expect(page.getByText('Form created')).toBeVisible()

    const row = page.locator('div').filter({ has: page.getByRole('heading', { level: 3, name }) }).filter({ has: page.getByRole('button', { name: 'Edit' }) }).last()
    await expect(row.getByText(/Inactive/)).toBeVisible()

    // Edit name
    await row.getByRole('button', { name: 'Edit' }).click()
    const renamed = `${name} v2`
    // React keeps the value attribute in sync on controlled inputs.
    await page.locator(`input[value="${name}"]`).fill(renamed)
    const saved = page.waitForResponse(r => /\/api\/admin\/forms\/[^/?]+$/.test(r.url()) && r.request().method() === 'PATCH')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    expect((await saved).ok()).toBeTruthy()
    await expect(page.getByText('Form saved')).toBeVisible()

    const row2 = page.locator('div').filter({ has: page.getByRole('heading', { level: 3, name: renamed }) }).filter({ has: page.getByRole('button', { name: 'Delete' }) }).last()

    // Dismissed delete keeps it
    const dismissed = dismissDialogs(page)
    await row2.getByRole('button', { name: 'Delete' }).click()
    await expect.poll(() => dismissed.length).toBe(1)
    expect(dismissed[0]).toMatch(/Permanently delete/)
    page.removeAllListeners('dialog')

    acceptDialogs(page)
    const deleted = page.waitForResponse(r => /\/api\/admin\/forms\/[^/?]+$/.test(r.url()) && r.request().method() === 'DELETE')
    await row2.getByRole('button', { name: 'Delete' }).click()
    expect((await deleted).ok()).toBeTruthy()
    await expect(page.getByText('Form deleted')).toBeVisible()
    await expect(page.getByRole('heading', { level: 3, name: renamed })).toBeHidden()
  })

  test('active forms offer Deactivate (confirm dismissed, nothing sent)', async ({ page }) => {
    await openForms(page)
    const deactivate = page.getByRole('button', { name: 'Deactivate' }).first()
    test.skip(!(await isShown(deactivate, 10000)), 'No active forms for this tenant.')
    const dialogs = dismissDialogs(page)
    let patched = false
    page.on('request', r => {
      if (/\/api\/admin\/forms\//.test(r.url()) && r.method() === 'PATCH') patched = true
    })
    await deactivate.click()
    await expect.poll(() => dialogs.length).toBe(1)
    expect(dialogs[0]).toMatch(/will no longer appear on encounters/)
    expect(patched).toBe(false)
  })
})
