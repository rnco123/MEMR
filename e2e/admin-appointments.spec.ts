import { expect, test, type Page } from '@playwright/test'
import { signInAs, visit } from './helpers/auth'
import { mockJson } from './helpers/mock'

function futureDate(days: number) {
  const d = new Date(Date.now() + days * 86400000)
  return d.toISOString().slice(0, 10)
}

function fakeAppointment(id: number, first: string, days: number, onsite = 'onsite') {
  return {
    id,
    patient_id: 900000 + id,
    appointment_date: futureDate(days),
    appointment_time: '10:30',
    onsite_type: onsite,
    encounter_status: null,
    encounter_id: null,
    location_id: null,
    location_title: 'Playwright Location',
    patient: {
      id: 900000 + id,
      first_name: first,
      last_name: 'Playwright',
      email: null,
      phone: null,
      date_of_birth: '1990-01-01',
    },
  }
}

const FAKE_ROWS = [
  fakeAppointment(910001, 'Alpha', 3),
  fakeAppointment(910002, 'Bravo', 5, 'telemedicine'),
  fakeAppointment(910003, 'Charlie', 9),
]

async function mockFuture(page: Page) {
  await page.addInitScript(() => sessionStorage.removeItem('future_appointments_list'))
  await mockJson(page, /\/api\/clinical\/flowboard\?.*scope=future/, { data: FAKE_ROWS }, { method: 'GET' })
}

test.describe('Admin — Future appointments', () => {
  test.setTimeout(120000)

  test('appointments page loads from the future-scope API', async ({ page }) => {
    await signInAs(page, 'admin')
    const res = page.waitForResponse(r => /\/api\/clinical\/flowboard\?.*scope=future/.test(r.url()))
    await visit(page, '/admin/appointments')
    expect((await res).ok()).toBeTruthy()

    await expect(page.getByRole('heading', { level: 1, name: 'Appointments' })).toBeVisible()
    // The count line ("0 appointment(s)") shows alongside the empty state.
    await expect(page.getByText(/^\d+ appointment/).first()).toBeVisible({ timeout: 20000 })
    // Admin never gets the nurse-only add button.
    await expect(page.getByRole('button', { name: /Add encounter/ })).toHaveCount(0)
  })

  test('rows render patient, visit type and actions', async ({ page }) => {
    await signInAs(page, 'admin')
    await mockFuture(page)
    await visit(page, '/admin/appointments')

    for (const header of ['Patient', 'Date', 'Time', 'Location', 'Visit type', 'Actions']) {
      await expect(page.getByRole('columnheader', { name: header })).toBeVisible()
    }
    await expect(page.getByText('Alpha Playwright')).toBeVisible()
    await expect(page.getByText('Telemedicine')).toBeVisible()
    await expect(page.getByText('On-site').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Move to waiting room' })).toHaveCount(3)
  })

  test('search filters rows by patient name', async ({ page }) => {
    await signInAs(page, 'admin')
    await mockFuture(page)
    await visit(page, '/admin/appointments')

    await page.getByPlaceholder('Search by patient name, ID, or date of birth...').fill('Bravo')
    await expect(page.getByText('Bravo Playwright')).toBeVisible()
    await expect(page.getByText('Alpha Playwright')).toBeHidden()
    await expect(page.getByText('Charlie Playwright')).toBeHidden()
  })

  test('date range filter and clear filters', async ({ page }) => {
    await signInAs(page, 'admin')
    await mockFuture(page)
    await visit(page, '/admin/appointments')

    await page.getByLabel('Appointment from').fill(futureDate(4))
    await page.getByLabel('Appointment to').fill(futureDate(6))
    await expect(page.getByText('Bravo Playwright')).toBeVisible()
    await expect(page.getByText('Alpha Playwright')).toBeHidden()
    await expect(page.getByText('Charlie Playwright')).toBeHidden()

    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(page.getByText('Alpha Playwright')).toBeVisible()
    await expect(page.getByText('Charlie Playwright')).toBeVisible()
  })

  test('location filter refetches with location_id', async ({ page }) => {
    await signInAs(page, 'admin')
    await visit(page, '/admin/appointments')

    const select = page.getByLabel('Filter by location')
    const options = await select.locator('option').count()
    test.skip(options < 2, 'No locations to filter by.')
    const res = page.waitForResponse(r => r.url().includes('scope=future') && r.url().includes('location_id='))
    await select.selectOption({ index: 1 })
    expect((await res).ok()).toBeTruthy()
  })

  test('move to waiting room confirms, posts and removes the row', async ({ page }) => {
    await signInAs(page, 'admin')
    await mockFuture(page)
    const moves = await mockJson(page, '**/api/appointments/910001/move-to-flowboard', { success: true }, { method: 'POST' })
    await visit(page, '/admin/appointments')

    const row = page.getByRole('row').filter({ hasText: 'Alpha Playwright' })
    await row.getByRole('button', { name: 'Move to waiting room' }).click()

    const dialog = page.getByRole('dialog').or(page.locator('[role="alertdialog"]'))
    await expect(page.getByText(/Move this visit to today/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Move to waiting room' }).click()

    await expect.poll(() => moves.length).toBe(1)
    await expect(page.getByText('Alpha Playwright')).toBeHidden()
  })

  test('cancelling the move dialog does not post', async ({ page }) => {
    await signInAs(page, 'admin')
    await mockFuture(page)
    const moves = await mockJson(page, /\/move-to-flowboard$/, { success: true }, { method: 'POST' })
    await visit(page, '/admin/appointments')

    await page.getByRole('button', { name: 'Move to waiting room' }).first().click()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText(/Move this visit to today/)).toBeHidden()
    expect(moves).toHaveLength(0)
  })

  test('move failure keeps the row and shows the error', async ({ page }) => {
    await signInAs(page, 'admin')
    await mockFuture(page)
    await mockJson(page, /\/move-to-flowboard$/, { error: 'Appointment already moved' }, { method: 'POST', status: 409 })
    await visit(page, '/admin/appointments')

    await page.getByRole('button', { name: 'Move to waiting room' }).first().click()
    await page.getByRole('dialog').or(page.locator('[role="alertdialog"]')).getByRole('button', { name: 'Move to waiting room' }).click()
    await expect(page.getByText('Appointment already moved')).toBeVisible()
    await expect(page.getByText('Alpha Playwright')).toBeVisible()
  })
})
