import { expect, test } from '@playwright/test'
import { trackPageErrors } from './helpers/auth'
import { isShown } from './helpers/wait'

test.describe('Public pages', () => {
  test.setTimeout(90000)

  test('landing page renders hero, features and CTAs', async ({ page }) => {
    const pageErrors = trackPageErrors(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { level: 1, name: 'A modern EMR built for your clinic' })).toBeVisible()
    for (const heading of [
      'Every visit, one patient file.',
      'Video visits, right next to the chart.',
      'AI that drafts, providers who decide.',
      'Up and running in three steps',
    ]) {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible()
    }
    await expect(page.locator('#features')).toBeAttached()
    await expect(page.locator('#how')).toBeAttached()
    await expect(page.getByText('All rights reserved.', { exact: false })).toBeVisible()
    pageErrors.expectNone()
  })

  test('landing "Register your clinic" goes to /signup', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Register your clinic' }).first().click()
    await page.waitForURL(/\/signup$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Register your clinic' })).toBeVisible()
  })

  test('landing "Get started" goes to /signup', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Get started' }).first().click()
    await page.waitForURL(/\/signup$/)
  })

  test('landing "Sign in" goes to /login', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Sign in' }).first().click()
    await page.waitForURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Welcome Back' }).last()).toBeVisible()
  })

  test('landing "See how it works" scrolls to the steps', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'See how it works' }).click()
    await expect(page).toHaveURL(/#how$/)
    await expect(page.getByRole('heading', { name: 'Up and running in three steps' })).toBeInViewport()
  })

  test('/welcome redirects to the landing page', async ({ page }) => {
    await page.goto('/welcome')
    await page.waitForURL(url => url.pathname === '/')
    await expect(page.getByRole('heading', { level: 1, name: 'A modern EMR built for your clinic' })).toBeVisible()
  })

  test('offline page shows tips and a retry button', async ({ page }) => {
    await page.goto('/offline')
    await expect(page).toHaveTitle(/Offline/)
    await expect(page.getByRole('heading', { level: 1, name: /You.re offline/ })).toBeVisible()
    await expect(page.getByRole('link', { name: 'admin@myclinicmd.com' })).toHaveAttribute('href', /^mailto:admin@myclinicmd\.com/)

    const reload = page.waitForEvent('load')
    await page.getByRole('button', { name: 'Try again' }).click()
    await reload
  })

  test('unknown route renders a 404', async ({ page }) => {
    const res = await page.goto('/this-route-does-not-exist-e2e')
    expect(res?.status()).toBe(404)
  })
})

test.describe('Login page details', () => {
  test.setTimeout(90000)

  test('login page shows headings, help link and back link', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: 'Welcome Back' }).last()).toBeVisible()
    await expect(page.getByText('Please sign in to access your medical platform.').last()).toBeVisible()
    await expect(page.getByRole('link', { name: 'admin@myclinicmd.com' }).last()).toHaveAttribute(
      'href',
      /^mailto:admin@myclinicmd\.com\?subject=Login/
    )
    await expect(page.getByRole('link', { name: 'Back to MyClinicMD' }).last()).toHaveAttribute('href', 'https://myclinicmd.com/')
  })

  test('password visibility toggle', async ({ page }) => {
    await page.goto('/login')
    const password = page.getByPlaceholder('Enter your password').last()
    await password.fill('secret-value')
    await expect(password).toHaveAttribute('type', 'password')
    await page.getByRole('button', { name: 'Show password' }).last().click()
    await expect(password).toHaveAttribute('type', 'text')
    await page.getByRole('button', { name: 'Hide password' }).last().click()
    await expect(password).toHaveAttribute('type', 'password')
  })

  test('empty submit does not call the login API', async ({ page }) => {
    await page.goto('/login')
    let called = false
    page.on('request', r => {
      if (r.url().endsWith('/api/auth/login')) called = true
    })
    await page.getByRole('button', { name: 'Sign In Now' }).last().click()
    await page.waitForTimeout(1000)
    expect(called).toBe(false)
    await expect(page).toHaveURL(/\/login/)
  })

  test('server error surfaces a message and re-enables submit', async ({ page }) => {
    await page.route('**/api/auth/login', route =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Login service down' }) })
    )
    await page.goto('/login')
    await page.getByPlaceholder('name@example.com').last().fill('someone@example.com')
    await page.getByPlaceholder('Enter your password').last().fill('Whatever123!')
    await page.getByRole('button', { name: 'Sign In Now' }).last().click()

    await expect(page.getByText(/Login service down|An unexpected error occurred/).last()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign In Now' }).last()).toBeEnabled()
  })

  test('redirectedFrom is kept when bounced to login', async ({ page }) => {
    await page.goto('/dashboard/patients-history')
    await page.waitForURL(/\/login/)
    expect(new URL(page.url()).searchParams.get('redirectedFrom')).toBe('/dashboard/patients-history')
  })

  test('language toggle switches the login page to Spanish', async ({ page }) => {
    await page.goto('/login')
    const toggle = page.getByLabel('Language').last()
    test.skip(!(await isShown(toggle, 10000)), 'No language toggle on login.')
    await toggle.getByText(/^ES$/).click()
    await expect(page.getByRole('heading', { name: 'Welcome Back' }).last()).toBeHidden()
    await page.evaluate(() => localStorage.setItem('memr.lang', 'en'))
  })
})
