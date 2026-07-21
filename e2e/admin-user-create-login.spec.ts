import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { signIn as adaptiveSignIn } from './helpers/sign-in'

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
  return adaptiveSignIn(page, email, password)
}

async function signInAsAdmin(page: Page, email: string, password: string) {
  const loginJson = await signIn(page, email, password)
  expect(loginJson.role, 'Expected the authenticated account to resolve to admin role').toBe(
    'admin'
  )
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

    // ── JS error collector ─────────────────────────────────────────────────────
    // React catches thrown errors in event handlers before they reach window.onerror,
    // so page.on('pageerror') misses them. React DOES log them via console.error though.
    // We collect both console errors and page errors to catch all regressions.
    const jsErrors: string[] = []
    page.on('pageerror', (err) => jsErrors.push(`[uncaught] ${err.message}`))
    page.on('console', (msg) => {
      if (msg.type() === 'error') jsErrors.push(`[console.error] ${msg.text()}`)
    })
    // ──────────────────────────────────────────────────────────────────────────

    const created = makeUniqueUser()
    let createdUid: string | null = null

    try {
      await signInAsAdmin(page, adminEmail, adminPassword)
      // waitForURL is already inside signInAsAdmin

      await page.goto('/admin/users')
      await page.waitForLoadState('networkidle')
      // admin-users-page testid exists on local; deployed uses heading text
      const usersPage = page.getByTestId('admin-users-page').or(
        page.getByRole('heading', { name: /clinical accounts|users/i })
      )
      await expect(usersPage).toBeVisible({ timeout: 30000 })

      // Create button: testid on local, button text on deployed
      const createBtn = page.getByTestId('admin-users-create-button').or(
        page.getByRole('button', { name: /create account|create user/i })
      )
      await createBtn.click()

      // Modal: testid on local, heading text on deployed
      const createModal = page.getByTestId('admin-users-create-modal').or(
        page.getByRole('heading', { name: /create user account/i }).locator('../..')
      )
      await expect(createModal).toBeVisible({ timeout: 30000 })

      // ── Role selection — must work without throwing an error ───────────────
      // The default role is 'doctor'. Click 'nurse' to verify role switching works.
      // Regression: test/playwright-admin-create-user-role-error broke onClick to
      // throw instead of calling setRole(), so this click must NOT produce an error.
      const nurseRoleBtn = page.getByTestId('admin-create-user-role-nurse').or(
        page.getByRole('button', { name: /^nurse$/i })
      )
      await expect(nurseRoleBtn).toBeVisible({ timeout: 15000 })
      await nurseRoleBtn.click()

      // After clicking, wait a moment for any React state update to flush
      await page.waitForTimeout(500)

      // Check for the error text directly in the DOM — no CSS class dependency,
      // so this works regardless of how Tailwind purges classes in CI builds.
      // getByText with exact:false matches any element containing this string.
      const roleErrorMsg = page.getByText('Failed to select role', { exact: true })

      // Assert it does not exist in the DOM at all (toHaveCount(0) is stricter
      // than not.toBeVisible — it fails even if the element is hidden but present)
      await expect(
        roleErrorMsg,
        'Role selection error appeared — regression is present in onClick handler'
      ).toHaveCount(0)
      // ──────────────────────────────────────────────────────────────────────

      // Form fields: testid on local, placeholder on deployed
      const nameInput = page.getByTestId('admin-users-name-input').or(
        page.getByPlaceholder(/full name|please enter user full name/i)
      )
      const emailInput = page.getByTestId('admin-users-email-input').or(
        page.getByPlaceholder(/email.*address|please enter user valid email/i)
      )
      const passwordInput = page.getByTestId('admin-users-password-input').or(
        page.getByPlaceholder(/min 8|password/i).first()
      )
      await nameInput.fill(created.name)
      await emailInput.fill(created.email)
      await passwordInput.fill(created.password)

      // ── Assert no JS errors occurred during form interaction ───────────────
      // Filter to errors that are clearly from our regression, not React internals
      // or unrelated network noise. The regression throws: 'Create user role selection failed'
      const regressionErrors = jsErrors.filter(e =>
        e.toLowerCase().includes('role') ||
        e.toLowerCase().includes('failed to select') ||
        e.toLowerCase().includes('create user role')
      )
      expect(
        regressionErrors,
        `Role-related JS/console errors before form submission:\n${regressionErrors.join('\n')}`
      ).toHaveLength(0)
      // ──────────────────────────────────────────────────────────────────────

      // Set up response listener before clicking — use broad URL match in case
      // the dev server resolves to localhost vs 127.0.0.1
      const createResponsePromise = page.waitForResponse(
        response =>
          /\/api\/admin\/users/.test(response.url()) && response.request().method() === 'POST',
        { timeout: 90000 }
      )
      // Submit button: testid on local, form submit button on deployed
      const submitBtn = page.getByTestId('admin-users-submit-button').or(
        page.locator('form').getByRole('button', { name: 'Create Account' })
      )
      await submitBtn.click()

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
