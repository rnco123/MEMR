/**
 * Remove .next so the next `next dev` / `next build` cannot serve stale chunks.
 *
 * Usage:
 *   node scripts/clean-next.cjs           # delete .next only
 *   node scripts/clean-next.cjs --stop-dev  # stop :3000/:3001 first (Windows-friendly)
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const dir = path.join(process.cwd(), '.next')
const stopDev = process.argv.includes('--stop-dev')

function stopDevServers() {
  const ports = [3000, 3001]
  if (process.platform === 'win32') {
    for (const port of ports) {
      try {
        execSync(
          `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
          { stdio: 'ignore' }
        )
      } catch {
        // Port not in use or no permission — safe to ignore.
      }
    }
    return
  }

  for (const port of ports) {
    try {
      execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null`, { stdio: 'ignore', shell: true })
    } catch {
      // Port not in use — safe to ignore.
    }
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function removeNextDir(attempts = 5) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      if (!fs.existsSync(dir)) {
        console.log('[clean-next] .next already absent')
        return
      }
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
      console.log('[clean-next] Removed', dir)
      return
    } catch (e) {
      const code = e && typeof e === 'object' && 'code' in e ? e.code : null
      if (code === 'ENOENT') return
      if (i === attempts) throw e
      const retryable = code === 'ENOTEMPTY' || code === 'EBUSY' || code === 'EPERM'
      if (!retryable) throw e
      console.log(`[clean-next] Retry ${i}/${attempts - 1} (${code})…`)
      sleep(400 * i)
    }
  }
}

if (stopDev) {
  console.log('[clean-next] Stopping dev servers on ports 3000/3001…')
  stopDevServers()
  sleep(500)
}

removeNextDir()
