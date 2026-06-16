/**
 * H-10 Security tests: Daily API key not in client bundle
 */

import * as fs from 'fs'
import * as path from 'path'
import * as glob from 'glob'

describe('H-10 — Daily API key not in client bundle', () => {
  // Only run this test if the .next/static folder exists (post-build)
  const staticDir = path.join(process.cwd(), '.next', 'static')
  const staticExists = fs.existsSync(staticDir)

  it('H-10-T01 Daily API key string not in .next/static chunks', () => {
    if (!staticExists) {
      console.log('Skipping: .next/static does not exist (run npm run build first)')
      return
    }
    const apiKey = process.env.DAILY_API_KEY || process.env.NEXT_PUBLIC_DAILY_API_KEY
    if (!apiKey || apiKey.length < 8) {
      console.log('Skipping: DAILY_API_KEY not set in env')
      return
    }

    const jsFiles = glob.sync('**/*.js', { cwd: staticDir, absolute: true })
    for (const file of jsFiles) {
      const content = fs.readFileSync(file, 'utf-8')
      expect(content).not.toContain(apiKey)
    }
  })

  // H-10-T02: env var name should not be NEXT_PUBLIC_DAILY_API_KEY in config
  it('H-10-T02 config.ts uses server-only DAILY_API_KEY env var', () => {
    const configPath = path.join(process.cwd(), 'lib', 'config.ts')
    const configContent = fs.readFileSync(configPath, 'utf-8')
    // Should prefer DAILY_API_KEY over NEXT_PUBLIC_DAILY_API_KEY
    expect(configContent).toContain("'DAILY_API_KEY'")
  })
})
