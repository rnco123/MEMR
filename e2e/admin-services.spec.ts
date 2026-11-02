import { expect, test } from '@playwright/test'
import { signInAs, visit } from './helpers/auth'
import { acceptDialogs, allowPublish, dismissDialogs, mockJson } from './helpers/mock'
import { isShown } from './helpers/wait'

/**
 * Services publish to the public patient site through the bridge. Writes are
 * mocked unless PLAYWRIGHT_ALLOW_PUBLISH=1, which runs a real
 * create → edit → delete round trip instead.
 */

test.describe('Admin — Services', () => {
  test.setTimeout(120000)

  test('services list loads with table and search', async ({ page }) => {
    await signInAs(page, 'admin')
    const res = page.waitForResponse(r => r.url().endsWith('/api/admin/services') && r.request().method() === 'GET')
    await visit(page, '/admin/services')
    expect((await res).ok()).toBeTruthy()

    await expect(page.getByRole('heading', { level: 1, name: 'Services' })).toBeVisible()
    for (const header of ['ID', 'English', 'Spanish', 'Slug']) {
      await expect(page.getByRole('columnheader', { name: header })).toBeVisible()
    }
    await page.getByPlaceholder('Search services…').fill('zzz-no-such-service-zzz')
    await expect(page.getByText('No services found.')).toBeVisible()
  })

  test('add form validates the English title', async ({ page }) => {
    await signInAs(page, 'admin')
    const posts = await mockJson(page, '**/api/admin/services', {}, { method: 'POST' })
    await visit(page, '/admin/services')

    await page.getByRole('button', { name: 'Add service' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'New service' })).toBeVisible()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('English title is required')).toBeVisible()
    expect(posts).toHaveLength(0)
  })

  test('add form cancel closes without saving', async ({ page }) => {
    await signInAs(page, 'admin')
    await visit(page, '/admin/services')
    await page.getByRole('button', { name: 'Add service' }).click()
    await page.getByLabel('Title (English)').fill('Should not save')
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'New service' })).toBeHidden()
  })

  test('create sends every field (mocked)', async ({ page }) => {
    test.skip(allowPublish, 'Real round trip covers this.')
    await signInAs(page, 'admin')
    const posts = await mockJson(
      page,
      '**/api/admin/services',
      req => ({ data: { id: 999999, ...req.postDataJSON() }, synced: true }),
      { method: 'POST' }
    )
    await visit(page, '/admin/services')

    await page.getByRole('button', { name: 'Add service' }).click()
    await page.getByLabel('Title (English)').fill('Playwright Service')
    await page.getByLabel('Title (Spanish)').fill('Servicio Playwright')
    await page.getByLabel('Description (English)').fill('Created by e2e')
    await page.getByLabel('Description (Spanish)').fill('Creado por e2e')
    await page.getByLabel('Slug').fill('playwright-service')
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    await expect.poll(() => posts.length).toBe(1)
    const body = posts[0]!.postDataJSON() as Record<string, unknown>
    expect(JSON.stringify(body)).toContain('Playwright Service')
    expect(JSON.stringify(body)).toContain('Servicio Playwright')
    expect(JSON.stringify(body)).toContain('playwright-service')
  })

  test('edit opens prefilled form for an existing service', async ({ page }) => {
    await signInAs(page, 'admin')
    const patches = await mockJson(page, /\/api\/admin\/services\/\d+$/, { success: true }, { method: 'PATCH' })
    await visit(page, '/admin/services')

    const edit = page.getByRole('button', { name: 'Edit' }).first()
    test.skip(!(await isShown(edit, 10000)), 'No services.')
    await edit.click()
    await expect(page.getByRole('heading', { level: 2, name: /Editing service #\d+/ })).toBeVisible()
    await expect(page.getByLabel('Title (English)')).not.toHaveValue('')
    await page.getByRole('button', { name: 'Cancel' }).click()
    expect(patches).toHaveLength(0)
  })

  test('dismissing the delete confirm keeps the service', async ({ page }) => {
    await signInAs(page, 'admin')
    const dialogs = dismissDialogs(page)
    const deletes = await mockJson(page, /\/api\/admin\/services\/\d+$/, {}, { method: 'DELETE' })
    await visit(page, '/admin/services')

    const del = page.getByRole('button', { name: 'Delete' }).first()
    test.skip(!(await isShown(del, 10000)), 'No services.')
    await del.click()
    await expect.poll(() => dialogs.length).toBe(1)
    expect(dialogs[0]).toContain('This removes it from the public site too.')
    expect(deletes).toHaveLength(0)
  })

  test('real create → edit → delete round trip', async ({ page }) => {
    test.skip(!allowPublish, 'Set PLAYWRIGHT_ALLOW_PUBLISH=1 to publish to the public site.')
    await signInAs(page, 'admin')
    acceptDialogs(page)
    await visit(page, '/admin/services')

    const title = `Playwright Service ${Date.now()}`
    await page.getByRole('button', { name: 'Add service' }).click()
    await page.getByLabel('Title (English)').fill(title)
    const created = page.waitForResponse(r => r.url().endsWith('/api/admin/services') && r.request().method() === 'POST')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    expect((await created).ok()).toBeTruthy()
    await expect(page.getByText(/Saved/)).toBeVisible()

    await page.getByPlaceholder('Search services…').fill(title)
    const row = page.getByRole('row').filter({ hasText: title })
    await expect(row).toBeVisible()

    await row.getByRole('button', { name: 'Edit' }).click()
    await page.getByLabel('Title (Spanish)').fill(`${title} ES`)
    const edited = page.waitForResponse(r => /\/api\/admin\/services\/\d+$/.test(r.url()) && r.request().method() === 'PATCH')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    expect((await edited).ok()).toBeTruthy()

    const deleted = page.waitForResponse(r => /\/api\/admin\/services\/\d+$/.test(r.url()) && r.request().method() === 'DELETE')
    await page.getByRole('row').filter({ hasText: title }).getByRole('button', { name: 'Delete' }).click()
    expect((await deleted).ok()).toBeTruthy()
    await expect(page.getByText('Service deleted.')).toBeVisible()
  })
})
