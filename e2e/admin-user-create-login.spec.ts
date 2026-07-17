import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL?.trim() || ''
const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD?.trim() || ''
const explicitNewUserPassword = process.env.PLAYWRIGHT_NEW_USER_PASSWORD?.trim() || ''
const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/

function requireCredentials() {
  if (!adminEmail || !adminPassword) {
    throw new Error(
      'Set PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD before running e2e tests.'
    )
  }
}

function makeUniqueUser() {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const fallbackPassword = `Playwright!Aa1${stamp}`
  return {
    email: `playwright.user.${stamp}@example.com`,
    name: `Playwright User ${stamp}`,
    password:
      explicitNewUserPassword && PASSWORD_POLICY.test(explicitNewUserPassword)
        ? explicitNewUserPassword
        : fallbackPassword,
  }
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  const loginForm = page.getByTestId('login-form').nth(1)
  await loginForm.getByTestId('login-email-input').fill(email)
  await loginForm.getByTestId('login-password-input').fill(password)
  const loginResponsePromise = page.waitForResponse(
    response => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST'
  )
  await loginForm.getByTestId('login-submit-button').click()
  const loginResponse = await loginResponsePromise
  expect(loginResponse.ok(), `Login failed with ${loginResponse.status()}`).toBeTruthy()
  // Wait for the client-side redirect to complete after a successful login
  await page.waitForLoadState('networkidle')
  return (await loginResponse.json()) as { role?: string | null }
}

async function signInAsAdmin(page: Page, email: string, password: string) {
  const loginJson = await signIn(page, email, password)
  expect(loginJson.role, 'Expected the authenticated account to resolve to admin role').toBe(
    'admin'
  )
  // The app shows a post-login animation then does router.push('/admin') after ~1800ms delay.
  // Wait up to 45s for the URL to settle on /admin.
  await page.waitForURL(/\/admin(?:\/)?$/, { timeout: 45000 })
}

async function loginRequest(request: APIRequestContext, email: string, password: string) {
  const response = await request.post('/api/auth/login', {
    data: { email, password },
  })
  expect(response.ok()).toBeTruthy()
}

async function signOut(page: Page) {
  const signOutResponsePromise = page.waitForResponse(
    response =>
      response.url().endsWith('/api/auth/signout') && response.request().method() === 'POST'
  )
  await page.getByRole('button', { name: 'Sign Out' }).click()
  const signOutResponse = await signOutResponsePromise
  expect(signOutResponse.ok()).toBeTruthy()
  // signOut() does window.location.href = '/' which hard-navigates to root,
  // then the app redirects unauthenticated users to /login.
  await page.waitForURL(/\/(login)?$/, { timeout: 30000 })
  await page.waitForLoadState('networkidle')
}

test.describe('admin user creation and login', () => {
  test.setTimeout(300000) // 5 minutes

  test('admin can create a user and the new user can log in', async ({ page, request }) => {
    requireCredentials()

    const created = makeUniqueUser()
    let createdUid: string | null = null

    try {
      await signInAsAdmin(page, adminEmail, adminPassword)
      // waitForURL is already inside signInAsAdmin

      await page.goto('/admin/users')
      await page.waitForLoadState('networkidle')
      await expect(page.getByTestId('admin-users-page')).toBeVisible({ timeout: 30000 })

      await page.getByTestId('admin-users-create-button').click()
      await expect(page.getByTestId('admin-users-create-modal')).toBeVisible({ timeout: 30000 })

      await page.getByTestId('admin-users-name-input').fill(created.name)
      await page.getByTestId('admin-users-email-input').fill(created.email)
      await page.getByTestId('admin-users-password-input').fill(created.password)

      // Set up response listener before clicking — use broad URL match in case
      // the dev server resolves to localhost vs 127.0.0.1
      const createResponsePromise = page.waitForResponse(
        response =>
          /\/api\/admin\/users/.test(response.url()) && response.request().method() === 'POST',
        { timeout: 90000 }
      )
      await page.getByTestId('admin-users-submit-button').click()

      const createResponse = await createResponsePromise
      expect(createResponse.ok(), `User creation failed: ${createResponse.status()}`).toBeTruthy()
      const createJson = (await createResponse.json()) as { uid?: string }
      createdUid = createJson.uid ?? null

      await signOut(page)
      // signOut() hard-redirects to / then middleware sends unauthenticated users to /login
      await page.waitForURL(/\/(login)?$/, { timeout: 30000 })

      await signIn(page, created.email, created.password)
      // New non-admin users land on /dashboard after the 1800ms post-login delay
      await page.waitForURL(/\/dashboard(?:\/)?$/, { timeout: 45000 })
    } finally {
      if (createdUid) {
        await page.request.delete('/api/admin/users', {
          data: { uid: createdUid },
        })
      }
    }
  })
})
