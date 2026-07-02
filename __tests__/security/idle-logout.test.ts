/**
 * HIPAA automatic logoff policy — 20 min idle, 60 s warning window.
 */

import {
  IDLE_TIMEOUT_MS,
  IDLE_WARNING_MS,
  getIdlePhase,
  idleSecondsLeft,
  isIdleExemptPath,
} from '@/lib/auth/idle-logout'

const MIN = 60 * 1000

describe('idle auto-logout policy', () => {
  it('uses a 20-minute timeout with a 60-second warning', () => {
    expect(IDLE_TIMEOUT_MS).toBe(20 * MIN)
    expect(IDLE_WARNING_MS).toBe(60 * 1000)
  })

  it('stays active before the warning threshold', () => {
    expect(getIdlePhase(0)).toBe('active')
    expect(getIdlePhase(18 * MIN)).toBe('active')
    expect(getIdlePhase(19 * MIN - 1)).toBe('active')
  })

  it('warns during the final 60 seconds', () => {
    expect(getIdlePhase(19 * MIN)).toBe('warning')
    expect(getIdlePhase(19 * MIN + 30_000)).toBe('warning')
    expect(getIdlePhase(20 * MIN - 1)).toBe('warning')
  })

  it('expires at 20 minutes and beyond (covers laptop sleep)', () => {
    expect(getIdlePhase(20 * MIN)).toBe('expired')
    expect(getIdlePhase(3 * 60 * MIN)).toBe('expired')
  })

  it('counts down whole seconds during the warning window', () => {
    expect(idleSecondsLeft(19 * MIN)).toBe(60)
    expect(idleSecondsLeft(19 * MIN + 30_000)).toBe(30)
    expect(idleSecondsLeft(20 * MIN)).toBe(0)
    expect(idleSecondsLeft(21 * MIN)).toBe(0)
  })

  it('exempts active video visits only', () => {
    expect(isIdleExemptPath('/video')).toBe(true)
    expect(isIdleExemptPath('/video/room-123')).toBe(true)
    expect(isIdleExemptPath('/dashboard')).toBe(false)
    expect(isIdleExemptPath('/videos-are-not-calls')).toBe(false)
    expect(isIdleExemptPath(null)).toBe(false)
  })
})

describe('idle guard is mounted for the whole app', () => {
  it('root layout renders IdleLogoutGuard inside AuthProvider', () => {
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const layout = fs.readFileSync(path.join(process.cwd(), 'app/layout.tsx'), 'utf-8')
    expect(layout).toContain('<IdleLogoutGuard />')
  })
})
