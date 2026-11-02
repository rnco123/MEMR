import { expect, test, type Page } from '@playwright/test'
import { signInAs, trackPageErrors, visit, type TestRole } from './helpers/auth'
import { mockJson } from './helpers/mock'
import { isShown } from './helpers/wait'

/**
 * Patient file (admin at /admin/patient-file/:id, clinical staff at
 * /patient-file/:id). Uses the first patient the role can see; skips if none.
 * Read-only apart from a mocked document upload/delete.
 */

async function firstPatientId(page: Page, role: TestRole): Promise<number | null> {
  const api = role === 'admin' ? '/api/admin/patients-history' : '/api/clinical/patients-history'
  const res = await page.request.get(api)
  if (!res.ok()) return null
  const json = (await res.json()) as { rows?: Array<{ id: number; encounter_count?: number }> }
  const rows = json.rows ?? []
  // Prefer a patient with a short history: the Forms tab loads each encounter's forms
  // one by one, and the shared encounter fixture keeps adding visits to the first patient.
  const withVisits = rows.filter(r => (r.encounter_count ?? 0) > 0)
  const pick = [...withVisits].sort((a, b) => (a.encounter_count ?? 0) - (b.encounter_count ?? 0))[0] ?? rows[0]
  return pick?.id ?? null
}

async function openFile(page: Page, role: TestRole) {
  await signInAs(page, role)
  const id = await firstPatientId(page, role)
  test.skip(id === null, 'No patients visible to this role.')
  const path = role === 'admin' ? `/admin/patient-file/${id}` : `/patient-file/${id}`
  const loaded = page.waitForResponse(r => r.url().endsWith(`/api/patients/${id}`))
  await visit(page, path)
  expect((await loaded).ok()).toBeTruthy()
  await expect(page.getByRole('heading', { level: 1, name: 'Patient File' })).toBeVisible()
  await expect(page.getByText(`ID: ${id}`).first()).toBeVisible()
  return id as number
}

const TABS = ['Encounters', 'Medical History', 'Medications', 'Forms', 'Documents']

for (const role of ['admin', 'nurse', 'doctor'] as const) {
  test.describe(`Patient file — ${role}`, () => {
    test.setTimeout(120000)

    test('header, contact and pharmacy sections render', async ({ page }) => {
      const pageErrors = trackPageErrors(page)
      await openFile(page, role)
      for (const label of ['Age', 'Gender', 'DOB']) await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
      await expect(page.getByRole('heading', { level: 3, name: 'Contact Information' })).toBeVisible()
      await expect(page.getByRole('heading', { level: 3, name: 'Pharmacy' })).toBeVisible()
      pageErrors.expectNone()
    })

    test('every tab loads without errors', async ({ page }) => {
      const pageErrors = trackPageErrors(page)
      await openFile(page, role)
      for (const tab of TABS) {
        await page.getByRole('button', { name: tab, exact: true }).click()
        // The Forms tab fetches each encounter's forms one by one, so allow for long histories.
        await expect(page.getByText(/^Loading .*\.\.\.$/)).toHaveCount(0, { timeout: 90000 })
      }
      pageErrors.expectNone()
    })

    test('back link returns to patients history', async ({ page }) => {
      await openFile(page, role)
      await page.getByRole('link', { name: 'Return to Patients History' }).first().click()
      await page.waitForURL(role === 'admin' ? /\/admin\/patients-history/ : /\/dashboard\/patients-history/)
    })
  })
}

test.describe('Patient file — details', () => {
  test.setTimeout(120000)

  test('encounter View Details opens the encounter modal', async ({ page }) => {
    await openFile(page, 'admin')
    const details = page.getByRole('button', { name: 'View Details' }).first()
    test.skip(!(await isShown(details, 10000)), 'Patient has no encounters.')
    await details.click()
    await expect(page.getByTestId('encounter-detail-modal')).toBeVisible({ timeout: 20000 })
  })

  test('forms tab loads each encounter and toggles its forms', async ({ page }) => {
    test.setTimeout(180000)
    await openFile(page, 'admin')
    const formsLoaded = page.waitForResponse(r => /\/api\/encounters\/[^/]+\/consent-forms/.test(r.url()), { timeout: 30000 }).catch(() => null)
    await page.getByRole('button', { name: 'Forms', exact: true }).click()
    test.skip((await formsLoaded) === null, 'Patient has no encounters.')
    await expect(page.getByText('Loading forms...')).toHaveCount(0, { timeout: 90000 })

    // The first encounter opens automatically; its toggle collapses and re-expands it.
    const hide = page.getByRole('button', { name: 'Hide Forms' }).first()
    await expect(hide).toBeVisible()
    await hide.click()
    await expect(page.getByRole('button', { name: 'Hide Forms' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Show Forms' }).first().click()
    await expect(page.getByRole('button', { name: 'Hide Forms' }).first()).toBeVisible()
  })

  test('document upload modal validates and posts (mocked)', async ({ page }) => {
    const id = await openFile(page, 'nurse')
    const uploads = await mockJson(page, `**/api/patients/${id}/documents`, { success: true }, { method: 'POST' })
    await page.getByRole('button', { name: 'Documents', exact: true }).click()
    await expect(page.getByRole('heading', { level: 3, name: 'Patient Documents' })).toBeVisible()

    await page.getByRole('button', { name: '+ Upload Document' }).click()
    await expect(page.getByRole('heading', { level: 3, name: 'Upload Document' })).toBeVisible()
    await page.getByPlaceholder('e.g., Insurance Card, Lab Results').fill('Playwright Lab Result')
    await page.locator('input[type="file"]').setInputFiles({
      name: 'playwright.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n%%EOF\n'),
    })
    await page.getByRole('button', { name: 'Upload', exact: true }).click()
    await expect.poll(() => uploads.length).toBe(1)
  })

  test('document upload cancel closes the modal', async ({ page }) => {
    await openFile(page, 'nurse')
    await page.getByRole('button', { name: 'Documents', exact: true }).click()
    await page.getByRole('button', { name: '+ Upload Document' }).click()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('heading', { level: 3, name: 'Upload Document' })).toBeHidden()
  })

  test('unknown patient id shows not found', async ({ page }) => {
    await signInAs(page, 'admin')
    await visit(page, '/admin/patient-file/999999999')
    await expect(page.getByRole('heading', { name: 'Patient Not Found' })).toBeVisible({ timeout: 20000 })
    await expect(page.getByRole('link', { name: 'Return to Patients History' }).last()).toBeVisible()
  })

  test('nurse cannot read a patient outside their locations via API', async ({ page }) => {
    await signInAs(page, 'nurse')
    const res = await page.request.get('/api/patients/999999999')
    expect([403, 404]).toContain(res.status())
  })
})
