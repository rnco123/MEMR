import { expect, test } from '@playwright/test'
import { hasCredentials, signInAs, trackPageErrors, visit } from './helpers/auth'
import { createDoctorEncounter } from './helpers/encounters'
import { mockJson } from './helpers/mock'
import { isShown } from './helpers/wait'

/**
 * Clinical dashboard shell and home (nurse + physician), appointments,
 * patients history and the physician virtual waiting room.
 */

const NURSE_NAV = ['Dashboard', 'Virtual waiting room', 'Appointments', 'Patients History', 'Form I-693', 'My profile', 'Support']
const DOCTOR_NAV = NURSE_NAV

test.describe('Clinical dashboard — home', () => {
  test.setTimeout(120000)

  test('nurse home shows welcome, assigned patients and permissions', async ({ page }) => {
    const pageErrors = trackPageErrors(page)
    await signInAs(page, 'nurse')
    await visit(page, '/dashboard')

    await expect(page.getByRole('heading', { level: 2, name: /^Welcome back, .+!$/ })).toBeVisible()
    await expect(page.getByText('Nurse Dashboard')).toBeVisible()
    await expect(page.getByRole('heading', { level: 3, name: 'Assigned Patients' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 3, name: 'Your Permissions' })).toBeVisible()
    // Availability toggle is physician-only.
    await expect(page.getByRole('button', { name: /^(Available|Unavailable)$/ })).toHaveCount(0)
    pageErrors.expectNone()
  })

  test('physician home shows upcoming appointments and availability toggle', async ({ page }) => {
    const pageErrors = trackPageErrors(page)
    await signInAs(page, 'doctor')
    await visit(page, '/dashboard')

    await expect(page.getByRole('heading', { level: 3, name: 'All Patients' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 3, name: 'Upcoming Appointments' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^(Available|Unavailable)$/ })).toBeVisible()
    pageErrors.expectNone()
  })

  test('physician availability toggle posts and flips (mocked)', async ({ page }) => {
    await signInAs(page, 'doctor')
    const posts = await mockJson(page, '**/api/doctors/availability', req => ({ success: true, ...req.postDataJSON() }), { method: 'POST' })
    await visit(page, '/dashboard')

    const toggle = page.getByRole('button', { name: /^(Available|Unavailable)$/ })
    const before = (await toggle.innerText()).trim()
    await toggle.click()
    await expect.poll(() => posts.length).toBe(1)
    const sent = (posts[0]!.postDataJSON() as { is_available: boolean }).is_available
    expect(sent).toBe(before === 'Unavailable')
  })

  test('physician refresh refetches stats', async ({ page }) => {
    await signInAs(page, 'doctor')
    await visit(page, '/dashboard')
    const res = page.waitForResponse(r => r.url().includes('/api/clinical/stats'))
    await page.getByRole('button', { name: 'Refresh' }).first().click()
    expect((await res).ok()).toBeTruthy()
  })

  test('"View All" goes to patients history', async ({ page }) => {
    await signInAs(page, 'nurse')
    await visit(page, '/dashboard')
    await page.getByRole('link', { name: 'View All' }).first().click()
    await page.waitForURL(/\/dashboard\/patients-history/)
  })

  test('nurse sidebar shows exactly the nurse items', async ({ page }) => {
    await signInAs(page, 'nurse')
    // Support sits below the <nav> element, so look across the page.
    for (const name of NURSE_NAV) await expect(page.getByRole('link', { name, exact: true }).first(), name).toBeVisible()
    await expect(page.getByRole('link', { name: 'Compliance' })).toHaveCount(0)
  })

  test('physician sidebar links all open', async ({ page }) => {
    const pageErrors = trackPageErrors(page)
    await signInAs(page, 'doctor')
    test.setTimeout(300000)
    const hrefs: string[] = []
    for (const name of DOCTOR_NAV) {
      const href = await page.getByRole('link', { name, exact: true }).first().getAttribute('href')
      expect(href, name).toMatch(/^\/dashboard/)
      hrefs.push(href!)
    }
    // Load each directly: first-hit compiles make long click chains flaky on dev.
    for (const href of hrefs) {
      await visit(page, href)
      expect(new URL(page.url()).pathname, href).toBe(href)
    }
    pageErrors.expectNone()
  })
})

test.describe('Clinical dashboard — appointments', () => {
  test.setTimeout(120000)

  test('nurse appointments page loads with the add encounter button', async ({ page }) => {
    await signInAs(page, 'nurse')
    const res = page.waitForResponse(r => r.url().includes('/api/clinical/flowboard') && r.url().includes('scope=future') && r.url().includes('mode=nurse'))
    await visit(page, '/dashboard/appointments')
    expect((await res).ok()).toBeTruthy()
    await expect(page.getByRole('heading', { level: 1, name: 'Appointments' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Add encounter/ })).toBeVisible()
  })

  test('nurse add encounter opens the modal', async ({ page }) => {
    await signInAs(page, 'nurse')
    await visit(page, '/dashboard/appointments')
    await page.getByRole('button', { name: /Add encounter/ }).click()
    await expect(page.getByRole('dialog').first()).toBeVisible()
  })

  test('doctor appointments page loads without the add button', async ({ page }) => {
    await signInAs(page, 'doctor')
    const res = page.waitForResponse(r => r.url().includes('scope=future') && r.url().includes('mode=doctor'))
    await visit(page, '/dashboard/appointments')
    expect((await res).ok()).toBeTruthy()
    await expect(page.getByRole('button', { name: /Add encounter/ })).toHaveCount(0)
  })

  test('refresh refetches future appointments', async ({ page }) => {
    await signInAs(page, 'nurse')
    await visit(page, '/dashboard/appointments')
    const res = page.waitForResponse(r => r.url().includes('scope=future'))
    await page.getByTitle('Refresh').first().click()
    expect((await res).ok()).toBeTruthy()
  })
})

test.describe('Clinical dashboard — patients history', () => {
  test.setTimeout(120000)

  for (const role of ['nurse', 'doctor'] as const) {
    test(`${role} patients history loads with table`, async ({ page }) => {
      await signInAs(page, role)
      const res = page.waitForResponse(r => r.url().includes('/api/clinical/patients-history'))
      await visit(page, '/dashboard/patients-history')
      expect((await res).ok()).toBeTruthy()
      await expect(page.getByRole('heading', { level: 1, name: 'Patients History' }).last()).toBeVisible()
      await expect(page.getByText(/Showing \d+–\d+ of \d+ patients/).or(page.getByText('No Patients Found')).last()).toBeVisible()
    })
  }

  test('search sends the term to the API and unknown term shows no results', async ({ page }) => {
    await signInAs(page, 'nurse')
    await visit(page, '/dashboard/patients-history')
    const res = page.waitForResponse(r => r.url().includes('/api/clinical/patients-history') && r.url().includes('search=zzzplaywright'))
    await page.getByPlaceholder('Search by name, email, phone, patient ID, or date of birth...').last().fill('zzzplaywright')
    expect((await res).ok()).toBeTruthy()
    await expect(page.getByText('No Results Found').last()).toBeVisible()
    await page.getByRole('button', { name: 'Clear search' }).last().click()
    await expect(page.getByPlaceholder('Search by name, email, phone, patient ID, or date of birth...').last()).toHaveValue('')
  })

  test('location filter refetches with location_id', async ({ page }) => {
    await signInAs(page, 'nurse')
    await visit(page, '/dashboard/patients-history')
    const select = page.getByLabel('Filter by location').last()
    test.skip(!(await isShown(select, 10000)) || (await select.locator('option').count()) < 2, 'Single location.')
    const res = page.waitForResponse(r => r.url().includes('/api/clinical/patients-history') && r.url().includes('location_id='))
    await select.selectOption({ index: 1 })
    expect((await res).ok()).toBeTruthy()
  })

  test('pagination moves to page 2', async ({ page }) => {
    await signInAs(page, 'nurse')
    await visit(page, '/dashboard/patients-history')
    const next = page.getByRole('button', { name: 'Next' }).last()
    test.skip(!(await next.isEnabled().catch(() => false)), 'Single page of patients.')
    const res = page.waitForResponse(r => r.url().includes('/api/clinical/patients-history') && r.url().includes('page=2'))
    await next.click()
    expect((await res).ok()).toBeTruthy()
    await expect(page.getByText(/Page 2 of \d+/).last()).toBeVisible()
  })

  test('View File opens the patient file', async ({ page }) => {
    await signInAs(page, 'nurse')
    await visit(page, '/dashboard/patients-history')
    const link = page.getByRole('link', { name: 'View File' }).first()
    test.skip(!(await isShown(link, 10000)), 'No patients.')
    await link.click()
    await page.waitForURL(/\/patient-file\/\d+$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Patient File' })).toBeVisible()
  })
})

test.describe('Clinical dashboard — physician virtual waiting room', () => {
  test.setTimeout(120000)

  test('nurse is redirected to the nurse flowboard', async ({ page }) => {
    await signInAs(page, 'nurse')
    await page.goto('/dashboard/flowboard')
    await page.waitForURL(/\/dashboard\/nurse-flowboard/)
  })

  test('physician flowboard loads with filters and list/board toggle', async ({ page }) => {
    const pageErrors = trackPageErrors(page)
    await signInAs(page, 'doctor')
    const res = page.waitForResponse(r => r.url().includes('/api/clinical/flowboard') && r.url().includes('mode=doctor'))
    await visit(page, '/dashboard/flowboard')
    expect((await res).ok()).toBeTruthy()

    await expect(page.getByRole('heading', { level: 1, name: 'Virtual waiting room' }).last()).toBeVisible()
    const tabs = page.getByRole('tablist', { name: 'Flowboard display mode' }).last()
    await tabs.getByRole('tab', { name: 'Board' }).click()
    await expect(tabs.getByRole('tab', { name: 'Board' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('Status updates when clinical actions complete', { exact: false })).toBeVisible()
    await tabs.getByRole('tab', { name: 'List' }).click()
    await expect(tabs.getByRole('tab', { name: 'List' })).toHaveAttribute('aria-selected', 'true')
    pageErrors.expectNone()
  })

  test('physician flowboard search with no match shows No Results Found', async ({ page }) => {
    await signInAs(page, 'doctor')
    await visit(page, '/dashboard/flowboard')
    // The page renders mobile and desktop copies of the search box; use the visible one.
    await page
      .locator('input[placeholder="Search by patient ID, name, email, phone, or date of birth..."]:visible')
      .first()
      .fill('zzz-playwright-nobody')
    // The list shows no empty-state message here, just a zero count.
    await expect(page.getByText(/Showing 0–0 of 0 appointments/).first()).toBeVisible()
  })

  test('physician flowboard refresh refetches', async ({ page }) => {
    await signInAs(page, 'doctor')
    await visit(page, '/dashboard/flowboard')
    const res = page.waitForResponse(r => r.url().includes('/api/clinical/flowboard'))
    await page.getByRole('button', { name: /^Refresh/ }).first().click()
    expect((await res).ok()).toBeTruthy()
  })

  test('batch complete confirm dismissed sends nothing', async ({ page }) => {
    await signInAs(page, 'doctor')
    await visit(page, '/dashboard/flowboard')
    const selectAll = page.getByLabel('Select all on page').last()
    test.skip(!(await isShown(selectAll, 10000)), 'No encounters to select.')
    let posted = false
    page.on('request', r => {
      if (r.url().endsWith('/api/encounters/batch-complete')) posted = true
    })
    page.once('dialog', d => void d.dismiss())
    await selectAll.check()
    await expect(page.getByText(/\d+ selected/).last()).toBeVisible()
    await page.getByRole('button', { name: 'Complete selected' }).last().click()
    await page.waitForTimeout(500)
    expect(posted).toBe(false)
    await page.getByRole('button', { name: 'Clear' }).last().click()
  })
})

test.describe('Video room', () => {
  test.setTimeout(120000)

  test('video without an encounter id shows guidance', async ({ page }) => {
    await signInAs(page, 'nurse')
    await visit(page, '/video')
    await expect(page.getByText('Encounter ID is required. Please join from the virtual waiting room.')).toBeVisible()
    await page.getByRole('button', { name: 'Back to Dashboard' }).click()
    await page.waitForURL(/\/dashboard/)
  })

  test('video room for an unknown encounter fails gracefully', async ({ page }) => {
    await signInAs(page, 'doctor')
    await visit(page, '/video?encounter=999999999')
    // The room can't be created for an unknown encounter, so the page shows its error
    // screen with a way back (instead of a blank video area).
    await expect(page.getByText(/^Error: /).first()).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole('button', { name: /Back to Dashboard/i })).toBeVisible()
  })

  test('video room join failure shows an error (mocked)', async ({ page, playwright }, testInfo) => {
    test.skip(!hasCredentials('nurse'), 'Needs the nurse account to create an encounter.')
    const { encounter_id } = await createDoctorEncounter(playwright, testInfo.project.use.baseURL!)
    await signInAs(page, 'doctor')
    await mockJson(page, '**/api/daily/room', { error: 'Daily unavailable' }, { method: 'POST', status: 500 })
    await visit(page, `/video?encounter=${encounter_id}`)
    await expect(
      page.getByText(/Failed to join video room|Could not get join token|Daily unavailable/).first()
    ).toBeVisible({ timeout: 30000 })
  })

  test('daily room API requires an encounter the user can access', async ({ page }) => {
    await signInAs(page, 'nurse')
    const res = await page.request.post('/api/daily/room', { data: { encounterId: 999999999 } })
    expect(res.ok()).toBeFalsy()
  })
})
