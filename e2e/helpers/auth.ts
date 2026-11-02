import { expect, test, type Page } from '@playwright/test'
import { signIn } from './sign-in'

export type TestRole = 'admin' | 'nurse' | 'doctor' | 'manager'

const ENV_PREFIX: Record<TestRole, string> = {
  admin: 'PLAYWRIGHT_ADMIN',
  nurse: 'PLAYWRIGHT_NURSE',
  doctor: 'PLAYWRIGHT_DOCTOR',
  manager: 'PLAYWRIGHT_MANAGER',
}

/** Role string /api/auth/login returns for each test account. */
const LOGIN_ROLE: Record<TestRole, RegExp> = {
  admin: /^admin$/,
  nurse: /^nurse$/,
  doctor: /^(doctor|fnp|pa)$/,
  manager: /^clinic_manager$/,
}

/** Where each role lands after sign-in. */
export const HOME_URL: Record<TestRole, RegExp> = {
  admin: /\/admin(?:\/)?$/,
  nurse: /\/dashboard/,
  doctor: /\/dashboard/,
  manager: /\/manage(?:\/)?$/,
}

export function credentials(role: TestRole) {
  const prefix = ENV_PREFIX[role]
  return {
    email: process.env[`${prefix}_EMAIL`]?.trim() || '',
    password: process.env[`${prefix}_PASSWORD`]?.trim() || '',
  }
}

export function hasCredentials(role: TestRole) {
  const { email, password } = credentials(role)
  return !!email && !!password
}

/** Skips the current test unless the role's credentials are set. */
export function requireRole(role: TestRole) {
  const prefix = ENV_PREFIX[role]
  test.skip(!hasCredentials(role), `Set ${prefix}_EMAIL and ${prefix}_PASSWORD.`)
}

/**
 * Waits for withRoleProtection's "Verifying access..." screen to clear. On the
 * dev server the profile request only starts once the page bundle compiles,
 * which can take several seconds on a route's first hit.
 */
export async function waitForAccessCheck(page: Page) {
  await expect(page.getByText('Verifying access')).toBeHidden({ timeout: 45000 })
}

/** Skips (if needed) and signs in as `role`, waiting for its landing page. */
export async function signInAs(page: Page, role: TestRole) {
  requireRole(role)
  const { email, password } = credentials(role)
  const json = await signIn(page, email, password)
  expect(json.role ?? '').toMatch(LOGIN_ROLE[role])
  await page.waitForURL(HOME_URL[role], { timeout: 45000 })
  await page.waitForLoadState('networkidle')
  await waitForAccessCheck(page)
  return json
}

/** Navigates to `path` and waits for the page to settle and pass its access check. */
export async function visit(page: Page, path: string) {
  await page.goto(path)
  // Best-effort: pages that poll or retry after an error never go fully idle.
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  await waitForAccessCheck(page)
}

/** Fails the test on uncaught page errors (React crashes, bad chunks). */
export function trackPageErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  return {
    errors,
    expectNone: () => expect(errors, `Uncaught page errors:\n${errors.join('\n')}`).toEqual([]),
  }
}
