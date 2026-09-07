/**
 * Security tests: the VonLinkage API key never reaches a client bundle.
 *
 * This key mints join tokens for any identity and role in the clinic's rooms,
 * so leaking it means anyone can join any consultation as a doctor and read
 * every patient's chat. It also does not expire — API keys are revoked, not
 * aged out — so a leak stays live until someone notices and revokes it.
 *
 * Anything prefixed `NEXT_PUBLIC_` is inlined into the browser bundle by
 * Next.js, so a credential read through a public-prefixed variable ships to
 * every visitor. The first test below bans the name outright rather than
 * waiting for a build to leak it.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as glob from 'glob'

// Assembled at runtime so this file does not match its own search.
const FORBIDDEN_PREFIX = `NEXT_PUBLIC_${'VONLINKAGE'}`

describe('VonLinkage API key is server-only', () => {
  it('VL-T01 no public-prefixed VonLinkage variable exists anywhere in the repo', () => {
    const files = glob.sync('**/*.{ts,tsx,js,jsx,mjs,cjs,json,md,yml,yaml,env,template,example}', {
      cwd: process.cwd(),
      absolute: true,
      nodir: true,
      dot: true,
      ignore: [
        '**/node_modules/**',
        '**/.next/**',
        '**/.git/**',
        '**/coverage/**',
        '**/dist/**',
        // This file necessarily describes the name it bans.
        '**/__tests__/security/vonlinkage-config.test.ts',
      ],
    })

    const offenders: string[] = []
    for (const file of files) {
      let content: string
      try {
        content = fs.readFileSync(file, 'utf-8')
      } catch {
        continue // unreadable or binary — nothing to leak from here
      }
      if (content.includes(FORBIDDEN_PREFIX)) {
        offenders.push(path.relative(process.cwd(), file))
      }
    }

    expect(offenders).toEqual([])
  })

  it('VL-T02 the credential is read only by the server-only client, never by config.ts', () => {
    // lib/config.ts is imported by client components, so anything it names ends
    // up in the browser bundle. Keeping the key out of it entirely means the
    // credential has no path to the client rather than merely not taking one.
    const configContent = fs.readFileSync(path.join(process.cwd(), 'lib', 'config.ts'), 'utf-8')
    expect(configContent).not.toContain('VONLINKAGE_API_KEY')
    expect(configContent).not.toContain(FORBIDDEN_PREFIX)

    const clientContent = fs.readFileSync(path.join(process.cwd(), 'lib', 'vonlinkage.ts'), 'utf-8')
    expect(clientContent).toContain('VONLINKAGE_API_KEY')
    expect(clientContent).not.toContain(FORBIDDEN_PREFIX)
    // The import guard is the thing that makes the above true.
    expect(clientContent).toContain("typeof window !== 'undefined'")
  })

  it('VL-T03 the API key string is not present in built client chunks', () => {
    const staticDir = path.join(process.cwd(), '.next', 'static')
    if (!fs.existsSync(staticDir)) {
      console.log('Skipping: .next/static does not exist (run npm run build first)')
      return
    }

    const apiKey = process.env.VONLINKAGE_API_KEY
    if (!apiKey || apiKey.length < 8) {
      console.log('Skipping: VONLINKAGE_API_KEY not set in env')
      return
    }

    const jsFiles = glob.sync('**/*.js', { cwd: staticDir, absolute: true })
    for (const file of jsFiles) {
      expect(fs.readFileSync(file, 'utf-8')).not.toContain(apiKey)
    }
  })

  it('VL-T04 the VonLinkage client module is never imported by a client component', () => {
    const files = glob.sync('{app,components,lib,hooks}/**/*.{ts,tsx}', {
      cwd: process.cwd(),
      absolute: true,
      nodir: true,
      ignore: ['**/node_modules/**', '**/*.test.ts', '**/*.test.tsx'],
    })

    const offenders: string[] = []
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8')
      const importsClient = /from\s+['"](@\/lib\/vonlinkage|\.\.?\/[^'"]*\/vonlinkage)['"]/.test(content)
      if (!importsClient) continue

      // 'use client' must be the first statement, so only the file head matters.
      const isClientComponent = /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*|\n)*\s*['"]use client['"]/.test(
        content
      )
      if (isClientComponent) {
        offenders.push(path.relative(process.cwd(), file))
      }
    }

    expect(offenders).toEqual([])
  })
})
