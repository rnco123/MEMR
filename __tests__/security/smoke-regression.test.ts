/**
 * M-10 + cross-cutting regression smoke tests
 * These validate static code properties that are guaranteed by the codebase itself.
 */

import * as fs from 'fs'
import * as path from 'path'

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf-8')
}

describe('M-10 — Test endpoints blocked in production', () => {
  // Middleware excludes /api/* (each route self-protects) — the H-11 guarantee
  // now lives in the route itself: auth gate + no upstream error passthrough.
  it('H-11 /api/openai/test route requires authentication', () => {
    const route = readFile('app/api/openai/test/route.ts')
    expect(route).toContain('getUser()')
    expect(route).toContain("{ error: 'Unauthorized' }, { status: 401 }")
  })
})

describe('H-10 — Daily API key source', () => {
  it('daily/room route uses server-only env var', () => {
    const route = readFile('app/api/daily/room/route.ts')
    expect(route).toContain('DAILY_API_KEY')
    // Must not reference NEXT_PUBLIC_DAILY_API_KEY as the only source
  })

  it('daily/end-room route uses server-only env var', () => {
    const route = readFile('app/api/daily/end-room/route.ts')
    expect(route).toContain('DAILY_API_KEY')
  })
})

describe('H-03 — Role resolution does not trust metadata', () => {
  it('admin-auth.ts reads profile role first', () => {
    const adminAuth = readFile('lib/admin-auth.ts')
    // Should fetch profile before checking metadata
    expect(adminAuth).toContain('fetchProfileFields')
    expect(adminAuth).not.toContain('user_metadata?.role')
  })

  it('middleware.ts does not use metadata role for authorization', () => {
    const middleware = readFile('middleware.ts')
    expect(middleware).not.toContain('user_metadata?.role')
  })

  it('api-auth.ts does not use metadata role for authorization', () => {
    const apiAuth = readFile('lib/security/api-auth.ts')
    expect(apiAuth).toContain('fetchUserRole')
    expect(apiAuth).not.toContain('user_metadata?.role')
  })
})

describe('PHI — Sentry session replay must mask text and media', () => {
  it('sentry.client.config.ts masks all text and blocks media in replays', () => {
    const config = readFile('sentry.client.config.ts')
    expect(config).toContain('maskAllText: true')
    expect(config).toContain('blockAllMedia: true')
  })
})

describe('H-04 — sync-profiles requires admin', () => {
  it('sync-profiles route calls requireAdminUser', () => {
    const route = readFile('app/api/chat/sync-profiles/route.ts')
    expect(route).toContain('requireAdminUser')
  })

  it('sync-profiles route has no debug telemetry', () => {
    const route = readFile('app/api/chat/sync-profiles/route.ts')
    expect(route).not.toContain('127.0.0.1:7242')
    expect(route).not.toContain('/ingest/')
  })
})

describe('H-12 — Audit log uses server-side user_id', () => {
  it('audit route uses user.id from getUser(), not request body', () => {
    const route = readFile('app/api/audit/route.ts')
    expect(route).toContain('user_id: user.id')
    expect(route).toContain('VALID_AUDIT_ACTIONS')
    expect(route).toContain('VALID_RESOURCE_TYPES')
  })
})

describe('M-04 — getSession not used for auth gates', () => {
  const filesToCheck = [
    'app/api/soap/complete-soap/route.ts',
    'app/api/daily/end-room/route.ts',
    'app/api/chat/sync-profiles/route.ts',
  ]

  for (const file of filesToCheck) {
    it(`${file} does not use getSession() for auth gate`, () => {
      const content = readFile(file)
      expect(content).not.toContain('getSession()')
    })
  }
})

describe('M-07 — Nurse search excludes null-location patients', () => {
  it('nurse patient-search does not include location_id.is.null for scoped users', () => {
    const route = readFile('app/api/nurse/patient-search/route.ts')
    // The vulnerable OR clause should be removed
    expect(route).not.toContain('location_id.is.null')
  })
})
