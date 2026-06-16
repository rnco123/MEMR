/**
 * M-04 Security tests: Ensure getSession() is not used for authorization in API routes
 */

import * as fs from 'fs'
import * as path from 'path'
import { glob } from 'glob'

describe('M-04 — Static: no getSession() for auth gates in app/api/**', () => {
  // Files that are intentionally allowed to use getSession (e.g. for token forwarding, not auth decisions)
  const ALLOWED_FILES = new Set<string>([
    // Add any intentional exceptions here if they arise
  ])

  it('M-04-T01 no API route uses getSession() as primary auth gate', async () => {
    const apiDir = path.join(process.cwd(), 'app', 'api')
    const files = await glob('**/*.ts', { cwd: apiDir, absolute: true })

    const violations: string[] = []

    for (const file of files) {
      const relative = path.relative(process.cwd(), file)
      if (ALLOWED_FILES.has(relative)) continue

      const content = fs.readFileSync(file, 'utf-8')

      // Flag files that use getSession() without a subsequent getUser() call
      if (content.includes('getSession()') && !content.includes('getUser()')) {
        violations.push(relative)
      }
    }

    if (violations.length > 0) {
      console.error('Files using getSession() without getUser():', violations)
    }
    expect(violations).toHaveLength(0)
  })
})
