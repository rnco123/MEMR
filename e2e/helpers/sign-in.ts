import { expect, type Page } from '@playwright/test'

/**
 * Signs in via the login page.
 * Adapts selectors based on whether running against the local dev server
 * (which has data-testid attributes) or the deployed app (plain inputs).
 */
export async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')

  const isDeployed = page.url().startsWith('https://')

  let loginResponsePromise: Promise<import('@playwright/test').Response>

  if (isDeployed) {
    // Deployed app: plain inputs, no data-testid — desktop form is last()
    await page.getByPlaceholder('name@example.com').last().fill(email)
    await page.getByPlaceholder('Enter your password').last().fill(password)
    loginResponsePromise = page.waitForResponse(
      r => r.url().includes('/api/auth/login') && r.request().method() === 'POST'
    )
    await page.getByRole('button', { name: 'Sign In Now' }).last().click()
  } else {
    // Local dev server: uses data-testid attributes on the desktop form (nth(1))
    const loginForm = page.getByTestId('login-form').nth(1)
    await loginForm.getByTestId('login-email-input').fill(email)
    await loginForm.getByTestId('login-password-input').fill(password)
    loginResponsePromise = page.waitForResponse(
      r => r.url().endsWith('/api/auth/login') && r.request().method() === 'POST'
    )
    await loginForm.getByTestId('login-submit-button').click()
  }

  const loginResponse = await loginResponsePromise
  expect(loginResponse.ok(), `Login failed: ${loginResponse.status()}`).toBeTruthy()

  // Wait for redirect animation to clear on both local and deployed
  await page.waitForFunction(
    () => !document.body.innerText.includes('Redirecting to dashboard'),
    { timeout: 15000 }
  ).catch(() => {})

  await page.waitForLoadState('networkidle')
  return (await loginResponse.json()) as { role?: string | null }
}
