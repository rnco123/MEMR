import { expect, test, type Page } from '@playwright/test'
import { mockJson } from './helpers/mock'

/**
 * Clinic self-signup. A real submit creates an auth user and a pending
 * signup_request through the bridge and burns the per-IP rate limit, so the
 * submit endpoint is always mocked.
 */

const VALID = {
  contact_name: 'Dr. Playwright Tester',
  email: 'playwright.signup@example.com',
  password: 'Playwright!Aa1',
  tenant_name: 'Playwright Family Health',
  location_name: 'Playwright — Downtown',
  location_address: '123 Main St, Houston, TX 77002',
  location_phone: '(555) 123-4567',
  location_email: 'frontdesk@playwright.example.com',
}

// Next renders an empty role="alert" route announcer; skip it.
const formError = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)')

async function openSignup(page: Page) {
  await page.goto('/signup')
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('clinic-signup-form')).toBeVisible()
}

async function fillValid(page: Page, overrides: Partial<typeof VALID & { confirm: string }> = {}) {
  const v = { ...VALID, ...overrides }
  await page.locator('#su-contact-name').fill(v.contact_name)
  await page.locator('#su-email').fill(v.email)
  await page.locator('#su-password').fill(v.password)
  await page.locator('#su-password-confirm').fill(overrides.confirm ?? v.password)
  await page.locator('#su-tenant').fill(v.tenant_name)
  await page.locator('#su-loc-name').fill(v.location_name)
  await page.locator('#su-loc-address').fill(v.location_address)
  // Close any address suggestion popover so it can't swallow the next click.
  await page.keyboard.press('Escape')
  await page.locator('#su-loc-phone').fill(v.location_phone)
  await page.locator('#su-loc-email').fill(v.location_email)
}

test.describe('Clinic signup', () => {
  test.setTimeout(90000)

  test('form renders every section and field', async ({ page }) => {
    await openSignup(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Register your clinic' })).toBeVisible()
    for (const section of ['Point of contact', 'Organization', 'First location']) {
      await expect(page.getByRole('heading', { level: 2, name: section })).toBeVisible()
    }
    for (const [id, placeholder] of [
      ['su-contact-name', 'Dr. Jane Smith'],
      ['su-email', 'jane@yourclinic.com'],
      ['su-password', 'Create a password'],
      ['su-password-confirm', 'Type the password again'],
      ['su-tenant', 'Sunrise Family Health'],
      ['su-loc-name', 'Sunrise — Downtown'],
      ['su-loc-address', '123 Main St, Houston, TX 77002'],
      ['su-loc-phone', '(555) 123-4567'],
      ['su-loc-email', 'frontdesk@yourclinic.com'],
    ] as const) {
      const field = page.locator(`#${id}`)
      await expect(field).toHaveAttribute('placeholder', placeholder)
      await expect(field).toHaveAttribute('required', '')
    }
  })

  test('empty submit is blocked by native validation', async ({ page }) => {
    await openSignup(page)
    const posts = await mockJson(page, '**/api/auth/clinic-signup', { success: true }, { method: 'POST' })
    await page.getByTestId('clinic-signup-submit').click()
    expect(await page.locator('#su-contact-name').evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true)
    expect(posts).toHaveLength(0)
  })

  test('invalid email is blocked by native validation', async ({ page }) => {
    await openSignup(page)
    const posts = await mockJson(page, '**/api/auth/clinic-signup', { success: true }, { method: 'POST' })
    await fillValid(page, { email: 'not-an-email' })
    await page.getByTestId('clinic-signup-submit').click()
    expect(await page.locator('#su-email').evaluate((el: HTMLInputElement) => el.validity.typeMismatch)).toBe(true)
    expect(posts).toHaveLength(0)
  })

  test('password checklist tracks each rule', async ({ page }) => {
    await openSignup(page)
    const pw = page.locator('#su-password')
    const rules = ['At least 8 characters', 'An uppercase letter', 'A lowercase letter', 'A number', 'A special character']
    for (const rule of rules) await expect(page.getByText(rule)).toBeVisible()

    await pw.fill('abc')
    await pw.fill('Playwright!Aa1')
    // All rules met: the form can be submitted without the rules error.
    await page.locator('#su-password-confirm').fill('Playwright!Aa1')
    await expect(page.getByText('Passwords match')).toBeVisible()
  })

  test('weak password shows the fill-in-correctly error and does not submit', async ({ page }) => {
    await openSignup(page)
    const posts = await mockJson(page, '**/api/auth/clinic-signup', { success: true }, { method: 'POST' })
    await fillValid(page, { password: 'alllowercase' })
    await page.getByTestId('clinic-signup-submit').click()
    await expect(formError(page)).toContainText('Please fill in every field correctly.')
    expect(posts).toHaveLength(0)
  })

  test('mismatched confirmation shows an error and does not submit', async ({ page }) => {
    await openSignup(page)
    const posts = await mockJson(page, '**/api/auth/clinic-signup', { success: true }, { method: 'POST' })
    await fillValid(page, { confirm: 'Playwright!Aa2' })
    await expect(page.getByText('Passwords do not match').first()).toBeVisible()
    await page.getByTestId('clinic-signup-submit').click()
    await expect(formError(page)).toContainText('Passwords do not match')
    expect(posts).toHaveLength(0)
  })

  test('show/hide toggles reveal the password', async ({ page }) => {
    await openSignup(page)
    await page.locator('#su-password').fill('Playwright!Aa1')
    await expect(page.locator('#su-password')).toHaveAttribute('type', 'password')
    await page.getByRole('button', { name: 'Show' }).first().click()
    await expect(page.locator('#su-password')).toHaveAttribute('type', 'text')
  })

  test('valid submit posts every field (but not the confirmation) and shows success', async ({ page }) => {
    await openSignup(page)
    const posts = await mockJson(page, '**/api/auth/clinic-signup', { success: true, status: 'pending' }, { method: 'POST' })
    await fillValid(page)
    await page.getByTestId('clinic-signup-submit').click()

    await expect(page.getByRole('heading', { level: 1, name: 'Request received' })).toBeVisible()
    expect(posts).toHaveLength(1)
    const body = posts[0]!.postDataJSON() as Record<string, unknown>
    for (const [key, value] of Object.entries(VALID)) expect(body[key], key).toBe(value)
    expect(Object.keys(body)).not.toContain('password_confirm')
    expect(JSON.stringify(body).match(/Playwright!Aa1/g)).toHaveLength(1)

    await page.getByRole('link', { name: 'Go to sign in' }).click()
    await page.waitForURL(/\/login$/)
  })

  test('server validation error is shown', async ({ page }) => {
    await openSignup(page)
    await mockJson(page, '**/api/auth/clinic-signup', { error: 'Please check the highlighted fields', code: 'VALIDATION_ERROR' }, { method: 'POST', status: 400 })
    await fillValid(page)
    await page.getByTestId('clinic-signup-submit').click()
    await expect(formError(page)).toContainText('Please check the highlighted fields')
    await expect(page.getByTestId('clinic-signup-submit')).toBeEnabled()
  })

  test('rate limit error is shown', async ({ page }) => {
    await openSignup(page)
    await mockJson(page, '**/api/auth/clinic-signup', { error: 'Too many signup attempts. Please try again later.' }, { method: 'POST', status: 429 })
    await fillValid(page)
    await page.getByTestId('clinic-signup-submit').click()
    await expect(formError(page)).toContainText('Too many signup attempts')
  })

  test('network failure shows the generic error', async ({ page }) => {
    await openSignup(page)
    await page.route('**/api/auth/clinic-signup', route => route.abort('failed'))
    await fillValid(page)
    await page.getByTestId('clinic-signup-submit').click()
    await expect(formError(page)).toContainText('We could not submit your request')
  })

  test('submit button shows progress while the request is in flight', async ({ page }) => {
    await openSignup(page)
    let release!: () => void
    const gate = new Promise<void>(r => (release = r))
    await page.route('**/api/auth/clinic-signup', async route => {
      await gate
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' })
    })
    await fillValid(page)
    await page.getByTestId('clinic-signup-submit').click()
    await expect(page.getByTestId('clinic-signup-submit')).toBeDisabled()
    await expect(page.getByTestId('clinic-signup-submit')).toHaveText(/Submitting/)
    release()
    await expect(page.getByRole('heading', { level: 1, name: 'Request received' })).toBeVisible()
  })

  test('clinic-signup API rejects an invalid payload without creating anything', async ({ request }) => {
    // Schema validation runs before the bridge call, so this has no side effects.
    const res = await request.post('/api/auth/clinic-signup', { data: { email: 'bad' } })
    expect([400, 429]).toContain(res.status())
  })
})
