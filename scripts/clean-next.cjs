/**
 * Remove .next so the next `next dev` / `next build` cannot serve stale chunks.
 */
const fs = require('fs')
const path = require('path')

const dir = path.join(process.cwd(), '.next')
try {
  fs.rmSync(dir, { recursive: true, force: true })
  console.log('[clean-next] Removed', dir)
} catch (e) {
  if (e && typeof e === 'object' && 'code' in e && e.code !== 'ENOENT') throw e
}
