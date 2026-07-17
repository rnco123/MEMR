import { request } from '@playwright/test'
import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000'
const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL?.trim() || ''
const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD?.trim() || ''

export default async function globalSetup() {
  if (!adminEmail || !adminPassword) return

  const ctx = await request.newContext({ baseURL })

  try {
    // Log in as admin — use a long timeout so cold server starts don't fail setup
    const loginRes = await ctx.post('/api/auth/login', {
      data: { email: adminEmail, password: adminPassword },
      timeout: 60000,
    })
    if (!loginRes.ok()) {
      console.warn('[global-setup] Admin login failed — skipping test-user cleanup')
      return
    }

    // Fetch all users
    const usersRes = await ctx.get('/api/admin/users', { timeout: 30000 })
    if (!usersRes.ok()) {
      console.warn('[global-setup] Could not fetch users — skipping cleanup')
      return
    }

    const { users } = (await usersRes.json()) as { users?: Array<{ uid: string; email: string }> }
    const testUsers = (users ?? []).filter(u => u.email?.startsWith('playwright.user.'))

    if (testUsers.length === 0) {
      console.log('[global-setup] No leftover test users to clean up.')
      return
    }

    console.log(`[global-setup] Deleting ${testUsers.length} leftover test user(s)…`)
    for (const u of testUsers) {
      const del = await ctx.delete('/api/admin/users', { data: { uid: u.uid }, timeout: 30000 })
      if (del.ok()) {
        console.log(`[global-setup]  ✓ Deleted ${u.email}`)
      } else {
        console.warn(`[global-setup]  ✗ Failed to delete ${u.email} (${del.status()})`)
      }
    }
  } catch (err) {
    // Never crash the test run due to cleanup failures
    console.warn('[global-setup] Cleanup skipped due to error:', err instanceof Error ? err.message : err)
  } finally {
    await ctx.dispose()
  }
}
