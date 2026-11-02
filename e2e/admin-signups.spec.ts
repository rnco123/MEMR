import { expect, test, type Page } from '@playwright/test'
import { signInAs, visit } from './helpers/auth'
import { mockJson } from './helpers/mock'

/**
 * Approve/reject create tenants and logins through the bridge and cannot be
 * undone, so every pending row here is mocked. The list endpoints for the
 * other tabs hit the real API.
 */

const FAKE_ID = '00000000-0000-4000-8000-00000000e2e1'

function fakeRow(overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString()
  return {
    id: FAKE_ID,
    user_id: null,
    status: 'pending',
    contact_name: 'Playwright Contact',
    email: 'playwright.signup@example.com',
    tenant_name: 'Playwright Test Clinic',
    location_name: 'Playwright Main Office',
    location_address: '123 Test St, Houston, TX 77002',
    location_phone: '5551234567',
    location_email: 'office@playwright-clinic.example.com',
    tenant_id: null,
    location_id: null,
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

async function mockPendingList(page: Page) {
  await mockJson(page, /\/api\/admin\/signup-requests\?status=pending/, { data: [fakeRow()] }, { method: 'GET' })
}

test.describe('Admin — Clinic signups', () => {
  test.setTimeout(120000)

  test('signups page loads each tab from the API', async ({ page }) => {
    await signInAs(page, 'admin')
    const pending = page.waitForResponse(r => r.url().includes('/api/admin/signup-requests?status=pending'))
    await visit(page, '/admin/signups')
    expect((await pending).ok()).toBeTruthy()

    await expect(page.getByRole('heading', { level: 1, name: 'Clinic signups' })).toBeVisible()

    for (const [tab, status] of [['Approved', 'approved'], ['Rejected', 'rejected'], ['Pending', 'pending']]) {
      const res = page.waitForResponse(r => r.url().includes(`/api/admin/signup-requests?status=${status}`))
      await page.getByRole('button', { name: tab, exact: true }).click()
      expect((await res).ok(), `${tab} tab`).toBeTruthy()
      // Either cards or the empty state — never a stuck spinner.
      await expect(page.getByText('No signups here.').or(page.locator('h3').first()).first()).toBeVisible({ timeout: 15000 })
    }
  })

  test('pending card shows contact, organization and location details', async ({ page }) => {
    await signInAs(page, 'admin')
    await mockPendingList(page)
    await visit(page, '/admin/signups')

    await expect(page.getByRole('heading', { level: 3, name: 'Playwright Test Clinic' })).toBeVisible()
    for (const group of ['Point of contact', 'Organization', 'Location']) {
      await expect(page.getByText(group, { exact: true }).first()).toBeVisible()
    }
    await expect(page.getByText('playwright.signup@example.com')).toBeVisible()
    await expect(page.getByText('123 Test St, Houston, TX 77002')).toBeVisible()
    for (const btn of ['Edit', 'Reject', 'Approve']) {
      await expect(page.getByRole('button', { name: btn, exact: true })).toBeVisible()
    }
  })

  test('admin can edit a pending signup before approving', async ({ page }) => {
    await signInAs(page, 'admin')
    await mockPendingList(page)
    const patches = await mockJson(page, `**/api/admin/signup-requests/${FAKE_ID}`, { data: fakeRow() }, { method: 'PATCH' })
    await visit(page, '/admin/signups')

    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    // Edit inputs follow FIELD_ORDER: contact_name, email, tenant_name, …
    const tenantInput = page.getByRole('textbox').nth(2)
    await expect(tenantInput).toHaveValue('Playwright Test Clinic')
    await tenantInput.fill('Playwright Renamed Clinic')
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    await expect(page.getByText('Changes saved.')).toBeVisible()
    expect(patches).toHaveLength(1)
    // Only the changed field is sent.
    expect(patches[0]!.postDataJSON()).toEqual({ tenant_name: 'Playwright Renamed Clinic' })
  })

  test('edit can be cancelled without saving', async ({ page }) => {
    await signInAs(page, 'admin')
    await mockPendingList(page)
    const patches = await mockJson(page, `**/api/admin/signup-requests/${FAKE_ID}`, {}, { method: 'PATCH' })
    await visit(page, '/admin/signups')

    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeVisible()
    expect(patches).toHaveLength(0)
  })

  test('approve calls the approve endpoint and shows success', async ({ page }) => {
    await signInAs(page, 'admin')
    await mockPendingList(page)
    const approvals = await mockJson(
      page,
      `**/api/admin/signup-requests/${FAKE_ID}/approve`,
      { data: fakeRow({ status: 'approved', tenant_id: 999, location_id: 999 }) },
      { method: 'POST' }
    )
    await visit(page, '/admin/signups')

    await page.getByRole('button', { name: 'Approve', exact: true }).click()
    await expect(page.getByText('Approved — the clinic can now sign in.')).toBeVisible()
    expect(approvals).toHaveLength(1)
  })

  test('approve failure surfaces the API error', async ({ page }) => {
    await signInAs(page, 'admin')
    await mockPendingList(page)
    await mockJson(
      page,
      `**/api/admin/signup-requests/${FAKE_ID}/approve`,
      { error: 'Tenant code already exists' },
      { method: 'POST', status: 409 }
    )
    await visit(page, '/admin/signups')

    await page.getByRole('button', { name: 'Approve', exact: true }).click()
    await expect(page.getByText('Tenant code already exists')).toBeVisible()
  })

  test('reject sends the optional reason', async ({ page }) => {
    await signInAs(page, 'admin')
    await mockPendingList(page)
    const rejects = await mockJson(
      page,
      `**/api/admin/signup-requests/${FAKE_ID}/reject`,
      { data: fakeRow({ status: 'rejected' }) },
      { method: 'POST' }
    )
    await visit(page, '/admin/signups')

    await page.getByRole('button', { name: 'Reject', exact: true }).click()
    await page.getByPlaceholder('Reason (optional)').fill('Duplicate registration')
    await page.getByRole('button', { name: 'Confirm reject' }).click()

    await expect(page.getByText('Signup rejected.')).toBeVisible()
    expect(rejects).toHaveLength(1)
    expect(rejects[0]!.postDataJSON()).toEqual({ note: 'Duplicate registration' })
  })

  test('reject can be cancelled', async ({ page }) => {
    await signInAs(page, 'admin')
    await mockPendingList(page)
    const rejects = await mockJson(page, `**/api/admin/signup-requests/${FAKE_ID}/reject`, {}, { method: 'POST' })
    await visit(page, '/admin/signups')

    await page.getByRole('button', { name: 'Reject', exact: true }).click()
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByPlaceholder('Reason (optional)')).toBeHidden()
    expect(rejects).toHaveLength(0)
  })

  test('list load failure shows an error toast', async ({ page }) => {
    await signInAs(page, 'admin')
    await mockJson(page, /\/api\/admin\/signup-requests\?status=pending/, { error: 'boom' }, { method: 'GET', status: 500 })
    // Plain goto: the toast lasts a few seconds, shorter than visit()'s settle wait.
    await page.goto('/admin/signups')
    await expect(page.getByText(/Could not load signups|boom/).first()).toBeVisible({ timeout: 20000 })
  })

  test('signup admin API rejects an invalid edit payload', async ({ page }) => {
    await signInAs(page, 'admin')
    const res = await page.request.patch(`/api/admin/signup-requests/${FAKE_ID}`, { data: {} })
    expect(res.status()).toBeGreaterThanOrEqual(400)
    expect(res.status()).toBeLessThan(500)
  })
})
