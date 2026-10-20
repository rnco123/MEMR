import { expect, test } from '@playwright/test'
import { signInAs, visit } from './helpers/auth'
import { isShown } from './helpers/wait'

/**
 * Admin prescription queue. Status changes go to real encounters, so the
 * PATCH is intercepted; listing and filters hit the real API.
 */

const queueUrl = (r: { url(): string }) => r.url().includes('/api/admin/prescription-ready?')

test.describe('Admin — Prescription queue', () => {
  test.setTimeout(120000)

  test('queue loads with filters and defaults to Pending', async ({ page }) => {
    await signInAs(page, 'admin')
    const res = page.waitForResponse(r => queueUrl(r) && r.url().includes('status=pending'))
    await visit(page, '/admin/prescriptions')
    expect((await res).ok()).toBeTruthy()

    await expect(page.getByRole('heading', { level: 1, name: 'Prescription queue' })).toBeVisible()
    for (const label of ['Clinic location', 'Pharmacy', 'Status', 'Gender', 'Prescription period (CT)']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
    }
    await expect(page.getByText(/Showing \d+ prescription groups/).or(page.getByText('No prescriptions in the queue.')).first()).toBeVisible()
  })

  for (const [pill, param] of [
    ['All statuses', /^(?!.*status=pending)/],
    ['Sent to pharmacy', /status=sent_to_pharmacy/],
  ] as const) {
    test(`status pill "${pill}" refetches`, async ({ page }) => {
      await signInAs(page, 'admin')
      await visit(page, '/admin/prescriptions')
      const res = page.waitForResponse(r => queueUrl(r) && param.test(r.url().split('?')[1] ?? ''))
      await page.getByRole('button', { name: pill, exact: true }).first().click()
      expect((await res).ok()).toBeTruthy()
    })
  }

  for (const [pill, param] of [
    ['Male', /gender=male/i],
    ['Female', /gender=female/i],
    ['Today', /prescription_date=/],
    ['This month', /prescription_date=/],
  ] as const) {
    test(`filter pill "${pill}" refetches`, async ({ page }) => {
      await signInAs(page, 'admin')
      await visit(page, '/admin/prescriptions')
      const res = page.waitForResponse(r => queueUrl(r) && param.test(r.url()))
      await page.getByRole('button', { name: pill, exact: true }).first().click()
      expect((await res).ok()).toBeTruthy()
    })
  }

  test('location multi-select opens with search', async ({ page }) => {
    await signInAs(page, 'admin')
    await visit(page, '/admin/prescriptions')
    await page.getByRole('button', { name: /All locations/ }).first().click()
    const search = page.getByPlaceholder('Search…').first()
    await expect(search).toBeVisible()
    await search.fill('zzz-no-such-location-zzz')
    await expect(page.getByText('No matches').or(page.getByText('None in queue')).first()).toBeVisible()
  })

  test('card status toggle sends PATCH for the encounter (mocked)', async ({ page }) => {
    await signInAs(page, 'admin')
    const patches: Array<{ url: string; body: unknown }> = []
    await page.route(/\/api\/admin\/prescription-ready\/encounter\/[^/]+$/, async route => {
      if (route.request().method() !== 'PATCH') return route.fallback()
      patches.push({ url: route.request().url(), body: route.request().postDataJSON() })
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' })
    })
    await visit(page, '/admin/prescriptions')

    const card = page.locator('div').filter({ hasText: 'Admin status' }).filter({ has: page.getByRole('button', { name: 'Sent to pharmacy' }) }).last()
    test.skip(!(await isShown(card, 10000)), 'Queue is empty.')
    await card.getByRole('button', { name: 'Sent to pharmacy', exact: true }).click()
    await expect.poll(() => patches.length).toBe(1)
    expect(patches[0]!.body).toEqual({ admin_status: 'sent_to_pharmacy' })
  })

  test('status update failure shows an error toast', async ({ page }) => {
    await signInAs(page, 'admin')
    await page.route(/\/api\/admin\/prescription-ready\/encounter\/[^/]+$/, route =>
      route.request().method() === 'PATCH'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' })
        : route.fallback()
    )
    await visit(page, '/admin/prescriptions')

    const card = page.locator('div').filter({ hasText: 'Admin status' }).filter({ has: page.getByRole('button', { name: 'Sent to pharmacy' }) }).last()
    test.skip(!(await isShown(card, 10000)), 'Queue is empty.')
    await card.getByRole('button', { name: 'Sent to pharmacy', exact: true }).click()
    await expect(page.getByText('Could not update status.')).toBeVisible()
  })

  test('View opens the prescription preview', async ({ page }) => {
    await signInAs(page, 'admin')
    await visit(page, '/admin/prescriptions')
    const view = page.getByRole('button', { name: 'View', exact: true }).first()
    test.skip(!(await isShown(view, 10000)), 'Queue is empty.')
    await view.click()
    await expect(page.getByText('Prescription preview').first()).toBeVisible()
  })

  test('Open patient file links to the admin patient file', async ({ page }) => {
    await signInAs(page, 'admin')
    await visit(page, '/admin/prescriptions')
    const link = page.getByRole('link', { name: 'Open patient file' }).first()
    test.skip(!(await isShown(link, 10000)), 'Queue is empty.')
    await expect(link).toHaveAttribute('href', /^\/admin\/patient-file\/\d+$/)
  })
})
