import { expect, test } from '@playwright/test'
import { signInAs } from './helpers/auth'

/**
 * Route + API access matrix. Mirrors getRequiredRolesForPath() and the
 * role redirects in middleware.ts, plus the per-route api-auth guards.
 * Read-only: every request is a GET or an intentionally rejected write.
 */

const PROTECTED_PAGES = [
  '/dashboard',
  '/dashboard/flowboard',
  '/dashboard/nurse-flowboard',
  '/dashboard/patients-history',
  '/dashboard/prescriptions',
  '/dashboard/appointments',
  '/dashboard/i-693',
  '/dashboard/compliance',
  '/dashboard/pharmacies',
  '/dashboard/support',
  '/dashboard/profile',
  '/admin',
  '/admin/users',
  '/admin/audit',
  '/admin/locations',
  '/admin/signups',
  '/manage',
  '/manage/staff',
  '/manage/flowboard',
  '/manage/patients-history',
  '/manage/support',
  '/video',
]

const ADMIN_PAGES = [
  '/admin',
  '/admin/appointments',
  '/admin/audit',
  '/admin/compliance',
  '/admin/configurations',
  '/admin/flowboard',
  '/admin/forms',
  '/admin/i-693',
  '/admin/locations',
  '/admin/patients-history',
  '/admin/pharmacies',
  '/admin/prescriptions',
  '/admin/release-logs',
  '/admin/services',
  '/admin/signups',
  '/admin/support',
  '/admin/users',
]

const MANAGE_PAGES = ['/manage', '/manage/staff', '/manage/flowboard', '/manage/patients-history', '/manage/support']

const PUBLIC_PAGES = ['/', '/login', '/signup', '/welcome', '/offline']

const ADMIN_APIS = [
  '/api/admin/users',
  '/api/admin/audit',
  '/api/admin/stats',
  '/api/admin/locations',
  '/api/admin/services',
  '/api/admin/forms',
  '/api/admin/configurations',
  '/api/admin/release-logs',
  '/api/admin/signup-requests',
  '/api/admin/tenants',
  '/api/admin/patients-history',
  '/api/admin/flowboard',
]

const MANAGE_APIS = [
  '/api/manage/me',
  '/api/manage/staff',
  '/api/manage/stats',
  '/api/manage/flowboard',
  '/api/manage/patients-history',
]

const CLINICAL_APIS = [
  '/api/clinical/flowboard',
  '/api/clinical/patients-history',
  '/api/clinical/stats',
  '/api/clinical/upcoming-appointments',
  '/api/i693/cases',
  '/api/compliance',
]

const AUTHENTICATED_APIS = ['/api/me/profile', '/api/me/locations', '/api/support/tickets', '/api/pharmacies']

const DENIED = [401, 403]

test.describe('Access control — signed out', () => {
  test.setTimeout(120000)

  for (const path of PROTECTED_PAGES) {
    test(`signed-out visit to ${path} redirects to /login`, async ({ page }) => {
      await page.goto(path)
      await page.waitForURL(/\/login/, { timeout: 30000 })
      const url = new URL(page.url())
      expect(url.pathname).toBe('/login')
      // Non-admin paths carry the original path for post-login return.
      if (!path.startsWith('/admin')) {
        expect(url.searchParams.get('redirectedFrom')).toBe(path)
      }
    })
  }

  for (const path of PUBLIC_PAGES) {
    test(`public page ${path} renders without signing in`, async ({ page }) => {
      const res = await page.goto(path)
      expect(res?.status(), `${path} status`).toBeLessThan(400)
      await page.waitForLoadState('networkidle')
      // Public pages must not bounce signed-out visitors to /login.
      if (path !== '/login') expect(new URL(page.url()).pathname).not.toBe('/login')
    })
  }

  test('removed routes /dashboard/orders and /dashboard/follow-ups are not served', async ({ request }) => {
    for (const path of ['/dashboard/orders', '/dashboard/follow-ups']) {
      const res = await request.get(path, { maxRedirects: 0 })
      expect([302, 307, 308]).toContain(res.status())
      expect(res.headers()['location']).toMatch(/\/dashboard$/)
    }
  })

  for (const path of [...ADMIN_APIS, ...MANAGE_APIS, ...CLINICAL_APIS, ...AUTHENTICATED_APIS]) {
    test(`signed-out GET ${path} is denied`, async ({ request }) => {
      const res = await request.get(path)
      expect(DENIED, `${path} returned ${res.status()}`).toContain(res.status())
    })
  }

  test('signed-out writes are denied', async ({ request }) => {
    const writes: Array<[string, 'post' | 'patch' | 'delete']> = [
      ['/api/admin/users', 'post'],
      ['/api/admin/users', 'patch'],
      ['/api/admin/users', 'delete'],
      ['/api/admin/locations', 'post'],
      ['/api/admin/services', 'post'],
      ['/api/manage/staff', 'post'],
      ['/api/prescriptions', 'post'],
      ['/api/pharmacies', 'post'],
      ['/api/nurse/walk-in', 'post'],
      ['/api/nurse/patients', 'post'],
      ['/api/support/tickets', 'post'],
    ]
    for (const [path, method] of writes) {
      const res = await request[method](path, { data: {} })
      expect(DENIED, `${method.toUpperCase()} ${path} returned ${res.status()}`).toContain(res.status())
    }
  })

  test('health endpoint reports status', async ({ request }) => {
    const res = await request.get('/api/health')
    expect([200, 503]).toContain(res.status())
    const body = (await res.json()) as { status?: string }
    expect(body.status).toMatch(/healthy|degraded/)
  })

  test('login API rejects bad credentials', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: { email: `nobody.${Date.now()}@example.com`, password: 'definitely-wrong-123' },
    })
    expect(res.ok()).toBeFalsy()
    expect(res.status()).toBeGreaterThanOrEqual(400)
  })

  test('login API rejects an empty body', async ({ request }) => {
    const res = await request.post('/api/auth/login', { data: {} })
    expect(res.status()).toBeGreaterThanOrEqual(400)
    expect(res.status()).toBeLessThan(500)
  })
})

test.describe('Access control — nurse', () => {
  test.setTimeout(180000)

  test('nurse is bounced from every admin page to /dashboard', async ({ page }) => {
    await signInAs(page, 'nurse')
    for (const path of ADMIN_PAGES) {
      await page.goto(path)
      await page.waitForURL(url => !url.pathname.startsWith('/admin'), { timeout: 30000 })
      expect(new URL(page.url()).pathname, path).toMatch(/^\/dashboard/)
    }
  })

  test('nurse is bounced from /manage pages', async ({ page }) => {
    await signInAs(page, 'nurse')
    for (const path of MANAGE_PAGES) {
      await page.goto(path)
      await page.waitForURL(url => !url.pathname.startsWith('/manage'), { timeout: 30000 })
      expect(new URL(page.url()).pathname, path).toMatch(/^\/dashboard/)
    }
  })

  test('nurse cannot open /dashboard/prescriptions (physician only)', async ({ page }) => {
    await signInAs(page, 'nurse')
    await page.goto('/dashboard/prescriptions')
    await page.waitForLoadState('networkidle')
    expect(new URL(page.url()).pathname).toBe('/dashboard')
  })

  test('nurse is denied admin and manager APIs', async ({ page }) => {
    await signInAs(page, 'nurse')
    for (const path of [...ADMIN_APIS, ...MANAGE_APIS]) {
      const res = await page.request.get(path)
      expect(DENIED, `${path} returned ${res.status()}`).toContain(res.status())
    }
  })

  test('nurse can read clinical and self APIs', async ({ page }) => {
    await signInAs(page, 'nurse')
    for (const path of ['/api/me/profile', '/api/clinical/flowboard', '/api/clinical/patients-history']) {
      const res = await page.request.get(path)
      expect(res.ok(), `${path} returned ${res.status()}`).toBeTruthy()
    }
  })
})

test.describe('Access control — doctor', () => {
  test.setTimeout(180000)

  test('doctor is bounced from admin and manage pages', async ({ page }) => {
    await signInAs(page, 'doctor')
    for (const path of ['/admin', '/admin/users', '/admin/audit', ...MANAGE_PAGES]) {
      await page.goto(path)
      await page.waitForURL(url => /^\/dashboard/.test(url.pathname), { timeout: 30000 })
    }
  })

  test('doctor can open /dashboard/prescriptions', async ({ page }) => {
    await signInAs(page, 'doctor')
    await page.goto('/dashboard/prescriptions')
    await page.waitForLoadState('networkidle')
    expect(new URL(page.url()).pathname).toBe('/dashboard/prescriptions')
  })

  test('doctor is denied admin and manager APIs', async ({ page }) => {
    await signInAs(page, 'doctor')
    for (const path of [...ADMIN_APIS, ...MANAGE_APIS]) {
      const res = await page.request.get(path)
      expect(DENIED, `${path} returned ${res.status()}`).toContain(res.status())
    }
  })
})

test.describe('Access control — admin', () => {
  test.setTimeout(180000)

  test('admin visiting /dashboard is kept in /admin', async ({ page }) => {
    await signInAs(page, 'admin')
    await page.goto('/dashboard/flowboard')
    await page.waitForURL(/\/admin(?:\/)?$/, { timeout: 30000 })
  })

  test('legacy /dashboard/i-693 deep link redirects admin to /admin/i-693', async ({ page }) => {
    await signInAs(page, 'admin')
    await page.goto('/dashboard/i-693')
    await page.waitForURL(/\/admin\/i-693/, { timeout: 30000 })
  })

  test('/patient-file/:id redirects admin to /admin/patient-file/:id', async ({ page }) => {
    await signInAs(page, 'admin')
    const res = await page.request.get('/patient-file/123', { maxRedirects: 0 })
    expect([302, 307, 308]).toContain(res.status())
    expect(res.headers()['location']).toMatch(/\/admin\/patient-file\/123$/)
  })

  test('admin is bounced from /manage', async ({ page }) => {
    await signInAs(page, 'admin')
    await page.goto('/manage')
    await page.waitForURL(url => !url.pathname.startsWith('/manage'), { timeout: 30000 })
  })

  test('admin can read every admin API', async ({ page }) => {
    await signInAs(page, 'admin')
    for (const path of ADMIN_APIS) {
      const res = await page.request.get(path)
      expect(res.ok(), `${path} returned ${res.status()}`).toBeTruthy()
    }
  })

  test('admin is denied manager APIs', async ({ page }) => {
    await signInAs(page, 'admin')
    for (const path of MANAGE_APIS) {
      const res = await page.request.get(path)
      expect(DENIED, `${path} returned ${res.status()}`).toContain(res.status())
    }
  })
})

test.describe('Access control — clinic manager', () => {
  test.setTimeout(180000)

  test('manager is pinned to /manage from clinical, admin and video pages', async ({ page }) => {
    await signInAs(page, 'manager')
    for (const path of ['/dashboard', '/dashboard/flowboard', '/admin', '/admin/users', '/video', '/patient-file/1']) {
      await page.goto(path)
      await page.waitForURL(/\/manage(?:\/)?$/, { timeout: 30000 })
    }
  })

  test('manager can read manager APIs', async ({ page }) => {
    await signInAs(page, 'manager')
    for (const path of MANAGE_APIS) {
      const res = await page.request.get(path)
      expect(res.ok(), `${path} returned ${res.status()}`).toBeTruthy()
    }
  })

  test('manager is denied admin and clinical (PHI) APIs', async ({ page }) => {
    await signInAs(page, 'manager')
    for (const path of [...ADMIN_APIS, ...CLINICAL_APIS]) {
      const res = await page.request.get(path)
      expect(DENIED, `${path} returned ${res.status()}`).toContain(res.status())
    }
  })
})
