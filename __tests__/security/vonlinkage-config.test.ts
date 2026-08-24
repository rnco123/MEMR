/**
 * H-10 Security tests: VonLinkage API key not in client bundle
 * (Video provider migrated from Daily.co to VonLinkage; same guarantee, new provider.)
 */

import * as fs from 'fs'
import * as path from 'path'
import * as glob from 'glob'

describe('H-10 — VonLinkage API key not in client bundle', () => {
  // Only run this test if the .next/static folder exists (post-build)
  const staticDir = path.join(process.cwd(), '.next', 'static')
  const staticExists = fs.existsSync(staticDir)

  it('H-10-T01 VonLinkage API key string not in .next/static chunks', () => {
    if (!staticExists) {
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
      const content = fs.readFileSync(file, 'utf-8')
      expect(content).not.toContain(apiKey)
    }
  })

  // H-10-T02: env var name should not be NEXT_PUBLIC_VONLINKAGE_API_KEY in config
  it('H-10-T02 config.ts uses server-only VONLINKAGE_API_KEY env var', () => {
    const configPath = path.join(process.cwd(), 'lib', 'config.ts')
    const configContent = fs.readFileSync(configPath, 'utf-8')
    // Should reference the server-only env var name
    expect(configContent).toContain("'VONLINKAGE_API_KEY'")
  })
})
