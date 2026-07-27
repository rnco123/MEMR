import { expect, test, type Page } from '@playwright/test'
import { signIn as adaptiveSignIn } from './helpers/sign-in'

const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL?.trim() || ''
const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD?.trim() || ''
const nurseEmail = process.env.PLAYWRIGHT_NURSE_EMAIL?.trim() || ''
const nursePassword = process.env.PLAYWRIGHT_NURSE_PASSWORD?.trim() || ''

async function signInAsAdmin(page: Page) {
  const json = await adaptiveSignIn(page, adminEmail, adminPassword)
  expect(json.role).toBe('admin')
  await page.waitForURL(/\/admin(?:\/)?$/, { timeout: 45000 })
}

async function signInAsNurse(page: Page) {
  const json = await adaptiveSignIn(page, nurseEmail, nursePassword)
  expect(json.role).toBe('nurse')
  await page.waitForURL(/\/dashboard/, { timeout: 45000 })
}

test.describe('Profile', () => {
  test.setTimeout(120000)

  test('user can edit display name and it is saved', async ({ page }) => {
    if (!nurseEmail || !nursePassword) {
      test.skip(true, 'Set nurse credentials.')
      return
    }

    await signInAsNurse(page)

    // Navigate to profile
    await page.goto('/dashboard/profile')
    await page.waitForLoadState('networkidle')

    // Find name input
    const nameInput = page.getByPlaceholder(/full name|display name|name/i).first()
    await expect(nameInput).toBeVisible({ timeout: 15000 })

    const original = await nameInput.inputValue()
    const updated = original.includes('(test)') ? original.replace(' (test)', '') : `${original} (test)`
    await nameInput.fill(updated)

    // Save
    const saveResponsePromise = page.waitForResponse(
      r => r.url().includes('/api/me/profile') && ['PUT', 'PATCH', 'POST'].includes(r.request().method()),
      { timeout: 30000 }
    )

    const saveBtn = page.getByRole('button', { name: /save|update/i }).first()
    await saveBtn.click()

    const saveResponse = await saveResponsePromise
    expect(saveResponse.ok(), `Profile save failed: ${saveResponse.status()}`).toBeTruthy()

    console.log('✓ Display name updated successfully')
  })

  test('user can change password', async ({ page }) => {
    if (!nurseEmail || !nursePassword) {
      test.skip(true, 'Set nurse credentials.')
      return
    }

    const tempPassword = 'Nurse@2025!'

    await signInAsNurse(page)
    await page.goto('/dashboard/profile')
    await page.waitForLoadState('networkidle')

    // Step 1: Verify current password
    const currentPwInput = page.getByPlaceholder(/current password/i)
    await expect(currentPwInput).toBeVisible({ timeout: 15000 })
    await currentPwInput.fill(nursePassword)

    const verifyResponsePromise = page.waitForResponse(
      r => r.url().includes('/api/me/password/verify') && r.request().method() === 'POST',
      { timeout: 30000 }
    )
    const verifyBtn = page.getByRole('button', { name: /verify password/i }).first()
    await verifyBtn.click()
    const verifyResponse = await verifyResponsePromise
    expect(verifyResponse.ok(), `Password verify failed: ${verifyResponse.status()}`).toBeTruthy()

    // Step 2: Set new password after verification
    const newPwInput = page.getByPlaceholder(/create a strong password/i).first()
    await expect(newPwInput).toBeVisible({ timeout: 15000 })
    await newPwInput.fill(tempPassword)

    const confirmPwInput = page.getByPlaceholder(/re-enter new password/i).first()
    await confirmPwInput.fill(tempPassword)

    const updateResponsePromise = page.waitForResponse(
      r => r.url().includes('/api/me/password') && !r.url().includes('verify') && r.request().method() === 'POST',
      { timeout: 30000 }
    )
    const updateBtn = page.getByRole('button', { name: /update password/i }).first()
    await expect(updateBtn).toBeEnabled({ timeout: 10000 })
    await updateBtn.click()
    const updateResponse = await updateResponsePromise
    expect(updateResponse.ok(), `Password update failed: ${updateResponse.status()}`).toBeTruthy()

    // Step 3: Logout
    const signOutResponsePromise = page.waitForResponse(
      r => r.url().endsWith('/api/auth/signout') && r.request().method() === 'POST',
      { timeout: 30000 }
    )
    await page.getByRole('button', { name: 'Sign Out' }).click()
    await signOutResponsePromise
    await page.waitForURL(/\/(login)?$/, { timeout: 30000 })
    await page.waitForLoadState('networkidle')

    // Step 4: Old password should fail
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    const isDeployed = page.url().startsWith('https://')
    if (isDeployed) {
      await page.getByPlaceholder('name@example.com').last().fill(nurseEmail)
      await page.getByPlaceholder('Enter your password').last().fill(nursePassword)
    } else {
      const loginForm = page.getByTestId('login-form').nth(1)
      await loginForm.getByTestId('login-email-input').fill(nurseEmail)
      await loginForm.getByTestId('login-password-input').fill(nursePassword)
    }
    const oldPwResponsePromise = page.waitForResponse(
      r => r.url().includes('/api/auth/login') && r.request().method() === 'POST',
      { timeout: 30000 }
    )
    if (isDeployed) {
      await page.getByRole('button', { name: 'Sign In Now' }).last().click()
    } else {
      await page.getByTestId('login-form').nth(1).getByTestId('login-submit-button').click()
    }
    const oldPwResponse = await oldPwResponsePromise
    expect(oldPwResponse.ok()).toBeFalsy()

    // Step 5: New password should succeed
    await page.waitForLoadState('networkidle')
    const newPwLoginResponsePromise = page.waitForResponse(
      r => r.url().includes('/api/auth/login') && r.request().method() === 'POST',
      { timeout: 30000 }
    )
    if (isDeployed) {
      await page.getByPlaceholder('Enter your password').last().fill(tempPassword)
      await page.getByRole('button', { name: 'Sign In Now' }).last().click()
    } else {
      const loginForm2 = page.getByTestId('login-form').nth(1)
      await loginForm2.getByTestId('login-password-input').fill(tempPassword)
      await loginForm2.getByTestId('login-submit-button').click()
    }
    const newPwLoginResponse = await newPwLoginResponsePromise
    expect(newPwLoginResponse.ok(), 'Login with new password failed').toBeTruthy()

    // Step 6: Change password back to original for test idempotency
    await page.waitForURL(/\/dashboard/, { timeout: 45000 })
    await page.goto('/dashboard/profile')
    await page.waitForLoadState('networkidle')

    await page.getByPlaceholder(/current password/i).fill(tempPassword)
    const reVerifyResponsePromise = page.waitForResponse(
      r => r.url().includes('/api/me/password/verify') && r.request().method() === 'POST',
      { timeout: 30000 }
    )
    await page.getByRole('button', { name: /verify password/i }).first().click()
    await reVerifyResponsePromise

    await expect(page.getByPlaceholder(/create a strong password/i).first()).toBeVisible({ timeout: 15000 })
    await page.getByPlaceholder(/create a strong password/i).first().fill(nursePassword)
    await page.getByPlaceholder(/re-enter new password/i).first().fill(nursePassword)
    const revertResponsePromise = page.waitForResponse(
      r => r.url().includes('/api/me/password') && !r.url().includes('verify') && r.request().method() === 'POST',
      { timeout: 30000 }
    )
    await page.getByRole('button', { name: /update password/i }).first().click()
    const revertResponse = await revertResponsePromise
    expect(revertResponse.ok(), 'Password revert failed').toBeTruthy()

    console.log('✓ Password changed, verified login, and reverted successfully')
  })

  test('user can view assigned locations', async ({ page }) => {
    if (!nurseEmail || !nursePassword) {
      test.skip(true, 'Set nurse credentials.')
      return
    }

    await signInAsNurse(page)
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Locations panel is on the dashboard page
    await expect(
      page.getByText(/your clinic locations|no clinic location assigned/i).first()
    ).toBeVisible({ timeout: 15000 })

    console.log('✓ Assigned locations visible on dashboard')
  })
})
