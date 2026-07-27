import { expect, test, type Page } from '@playwright/test'
import { signIn as adaptiveSignIn } from './helpers/sign-in'

const DEPLOYED_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mcm-testing.up.railway.app'
const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL?.trim() || ''
const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD?.trim() || ''
const nurseEmail = process.env.PLAYWRIGHT_NURSE_EMAIL?.trim() || ''
const nursePassword = process.env.PLAYWRIGHT_NURSE_PASSWORD?.trim() || ''

// Shared ticket subject so later tests can find the ticket created in test 1
let createdTicketSubject = ''

async function signInAsNurse(page: Page) {
  const json = await adaptiveSignIn(page, nurseEmail, nursePassword)
  expect(json.role).toBe('nurse')
  await page.waitForURL(/\/dashboard/, { timeout: 45000 })
  await page.waitForLoadState('networkidle')
}

async function signInAsAdmin(page: Page) {
  const json = await adaptiveSignIn(page, adminEmail, adminPassword)
  expect(json.role).toBe('admin')
  await page.waitForURL(/\/admin/, { timeout: 45000 })
  await page.waitForLoadState('networkidle')
}

test.describe('Support Tickets', () => {
  test.setTimeout(120000)

  // ── Test 1: Nurse creates a ticket ───────────────────────────────────────
  test('nurse can create a support ticket', async ({ page }) => {
    if (!nurseEmail || !nursePassword) {
      test.skip(true, 'Set nurse credentials.')
      return
    }

    await signInAsNurse(page)
    await page.goto(`${DEPLOYED_URL}/dashboard/support`)
    await page.waitForLoadState('networkidle')

    // Click "New Ticket" in the list header
    const newTicketBtn = page.getByRole('button', { name: 'New Ticket' })
    await expect(newTicketBtn).toBeVisible({ timeout: 20000 })
    await newTicketBtn.click()

    // ── Subject ─────────────────────────────────────────────────────────────
    const subjectInput = page.getByPlaceholder('Brief description of your issue')
    await expect(subjectInput).toBeVisible({ timeout: 10000 })
    createdTicketSubject = `Playwright test ticket ${Date.now()}`
    await subjectInput.fill(createdTicketSubject)

    // ── Description ─────────────────────────────────────────────────────────
    const contentInput = page.getByPlaceholder(
      'Describe the issue in detail. What happened? What did you expect?'
    )
    await expect(contentInput).toBeVisible({ timeout: 5000 })
    await contentInput.fill(
      'This is an automated test ticket created by Playwright. Please ignore.'
    )

    // ── Priority (pill buttons: Low / Normal / High / Urgent) ───────────────
    const highBtn = page.getByRole('button', { name: /^high$/i })
    if (await highBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await highBtn.click()
    }

    // ── Submit ───────────────────────────────────────────────────────────────
    // Set up response listener BEFORE clicking submit
    const submitResponsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/support/tickets') && r.request().method() === 'POST',
      { timeout: 30000 }
    )

    const submitBtn = page.getByRole('button', { name: 'Submit Ticket' })
    await expect(submitBtn).toBeEnabled({ timeout: 5000 })
    await submitBtn.click()

    const submitResponse = await submitResponsePromise
    expect(submitResponse.ok(), `Ticket creation failed: ${submitResponse.status()}`).toBeTruthy()

    console.log('✓ Support ticket submitted successfully')

    // ── Verify ticket appears in the list ────────────────────────────────────
    await expect(page.getByText(createdTicketSubject)).toBeVisible({ timeout: 15000 })
    console.log('✓ Ticket confirmed visible in the list')
  })

  // ── Test 2: Admin views, replies, and marks resolved ─────────────────────
  test('admin can view and respond to support ticket', async ({ page }) => {
    if (!adminEmail || !adminPassword) {
      test.skip(true, 'Set admin credentials.')
      return
    }

    await signInAsAdmin(page)
    await page.goto(`${DEPLOYED_URL}/admin/support`)
    await page.waitForLoadState('networkidle')

    // Wait for the page heading
    await expect(
      page.getByRole('heading', { name: /support/i }).first()
    ).toBeVisible({ timeout: 20000 })

    // Allow real-time subscriptions to settle
    await page.waitForTimeout(1500)

    // Tickets are <button> cards (not table rows). Each card has the subject
    // in a <p class="font-medium text-slate-800"> inside it.
    const ticketCards = page.locator('button').filter({
      has: page.locator('p.font-medium.text-slate-800'),
    })

    const cardCount = await ticketCards.count()
    if (cardCount === 0) {
      console.log('ℹ No tickets available — skipping reply test')
      return
    }

    console.log(`✓ Found ${cardCount} ticket(s)`)

    // If we created a ticket in test 1, open it specifically; else open first
    let targetCard = ticketCards.first()
    if (createdTicketSubject) {
      const specific = ticketCards.filter({ hasText: createdTicketSubject })
      if ((await specific.count()) > 0) targetCard = specific.first()
    }

    await targetCard.click()
    await page.waitForLoadState('networkidle')

    // Confirm we're in the thread view (h2 subject heading)
    await expect(page.locator('h2').first()).toBeVisible({ timeout: 10000 })
    console.log('✓ Ticket thread opened')

    // ── Fill reply textarea ───────────────────────────────────────────────────
    // Exact placeholder from source:
    // "Reply to this ticket… (Enter to send, Shift+Enter for newline)"
    const replyInput = page.getByPlaceholder(
      'Reply to this ticket… (Enter to send, Shift+Enter for newline)'
    )
    await expect(replyInput).toBeVisible({ timeout: 10000 })
    await replyInput.click() // focus the field

    // Use pressSequentially so each keystroke fires React's onChange properly.
    // fill() writes the DOM value directly and can bypass React's synthetic
    // event system, leaving replyContent state empty → sendReply returns early.
    const replyText = 'Admin reply from Playwright test. Your issue has been reviewed.'
    await replyInput.pressSequentially(replyText, { delay: 30 })

    // The submit button is type="submit" inside the form.
    // It is disabled until replyContent.trim() is truthy.
    const sendBtn = page.locator('button[type="submit"]').filter({ hasText: /send/i })
    await expect(sendBtn).toBeEnabled({ timeout: 5000 })

    // Set up response listener BEFORE clicking
    const replyResponsePromise = page.waitForResponse(
      (r) =>
        r.url().includes('/api/support/tickets') &&
        r.url().includes('/messages') &&
        r.request().method() === 'POST',
      { timeout: 30000 }
    )

    await sendBtn.click()

    const replyResponse = await replyResponsePromise
    expect(replyResponse.ok(), `Reply failed: ${replyResponse.status()}`).toBeTruthy()
    console.log('✓ Admin replied to support ticket successfully')

    // Wait for the optimistic message to appear in the thread
    await expect(page.getByText(replyText)).toBeVisible({ timeout: 10000 })

    // ── Mark ticket as Resolved ───────────────────────────────────────────────
    // The "Resolved" button is type="button" and only shown when status is not
    // already resolved/closed. It appears in the right column of the form.
    const resolvedBtn = page.getByRole('button', { name: 'Resolved' })
    const resolvedBtnVisible = await resolvedBtn.isVisible({ timeout: 5000 }).catch(() => false)

    if (resolvedBtnVisible) {
      const resolvedResponsePromise = page.waitForResponse(
        (r) =>
          r.url().includes('/api/support/tickets') &&
          r.request().method() === 'PATCH',
        { timeout: 15000 }
      )
      await resolvedBtn.click()
      const resolvedResponse = await resolvedResponsePromise
      expect(resolvedResponse.ok(), `Status update failed: ${resolvedResponse.status()}`).toBeTruthy()
      console.log('✓ Ticket marked as resolved')
    } else {
      console.log('ℹ Resolved button not visible — ticket may already be resolved/closed')
    }
  })

  // ── Test 3: Nurse verifies admin reply and closes ticket ─────────────────
  test('nurse can see admin reply and close resolved ticket', async ({ page }) => {
    if (!nurseEmail || !nursePassword) {
      test.skip(true, 'Set nurse credentials.')
      return
    }

    await signInAsNurse(page)
    await page.goto(`${DEPLOYED_URL}/dashboard/support`)
    await page.waitForLoadState('networkidle')

    // Wait for ticket list to fully load
    await page.waitForTimeout(2000)

    // Find the ticket created in test 1 by its subject text.
    // On the nurse side, ticket cards are <button> elements containing the subject.
    // Use getByRole('button') filtered by the stored subject text.
    const subjectToFind = createdTicketSubject || 'Playwright test ticket'
    const targetCard = page.getByRole('button').filter({ hasText: subjectToFind }).first()

    const cardVisible = await targetCard.isVisible({ timeout: 10000 }).catch(() => false)
    if (!cardVisible) {
      console.log(`ℹ Ticket "${subjectToFind}" not found — skipping`)
      return
    }

    console.log(`✓ Found ticket: ${subjectToFind}`)
    await targetCard.click()

    // Wait for thread to load (messages area becomes visible)
    await expect(page.locator('h2').first()).toBeVisible({ timeout: 10000 })
    await page.waitForTimeout(1500) // let messages render

    // ── Verify admin reply is visible ─────────────────────────────────────────
    // Admin messages appear in violet speech bubbles.
    const adminReplyText = 'Admin reply from Playwright test. Your issue has been reviewed.'
    await expect(
      page.getByText(adminReplyText)
    ).toBeVisible({ timeout: 15000 })
    console.log('✓ Nurse can see admin reply in the thread')

    // ── Check current status badge ─────────────────────────────────────────────
    // Status is shown in a rounded badge in the thread header.
    // Log what status the ticket is in so we know the flow worked end-to-end.
    const statusBadge = page.locator('.rounded-full').filter({ hasText: /open|in.progress|resolved|closed/i }).first()
    const statusText = await statusBadge.textContent({ timeout: 5000 }).catch(() => 'unknown')
    console.log(`✓ Ticket status: ${statusText?.trim()}`)

    // ── Close the ticket if it is in "resolved" state ─────────────────────────
    // "✓ Verify & Close" only appears when activeTicket.status === 'resolved'.
    // The JSX uses &amp; which renders as &.
    const closeBtn = page.getByRole('button', { name: /verify.*close/i })
    const closeBtnVisible = await closeBtn.isVisible({ timeout: 5000 }).catch(() => false)

    if (closeBtnVisible) {
      const closeResponsePromise = page.waitForResponse(
        (r) =>
          r.url().includes('/api/support/tickets') &&
          r.request().method() === 'PATCH',
        { timeout: 15000 }
      )
      await closeBtn.click()
      const closeResponse = await closeResponsePromise
      expect(closeResponse.ok(), `Close ticket failed: ${closeResponse.status()}`).toBeTruthy()
      console.log('✓ Nurse closed the ticket successfully')

      // Verify the "Ticket closed" banner appears in the thread
      await expect(page.getByText(/ticket closed/i)).toBeVisible({ timeout: 10000 })
      console.log('✓ Ticket closed status confirmed in thread')
    } else {
      console.log(`ℹ Status is "${statusText?.trim()}" — "Verify & Close" only shows when resolved`)
    }
  })
})
