import { act, renderHook } from '@testing-library/react'
import { useTenantColors } from '@/lib/configurations/use-tenant-colors'
import {
  DEFAULT_TENANT_COLOR,
  TENANT_COLORS_STORAGE_KEY,
  saveTenantColors,
} from '@/lib/configurations/tenant-colors'

describe('useTenantColors', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('falls back to the tenant brand color when nothing is configured', () => {
    const { result } = renderHook(() => useTenantColors())
    expect(result.current.colorForTenant(1)).toBe('#c1001f')
    expect(result.current.colorForTenant(3)).toBe('#1b6b93')
    expect(result.current.colorForTenant(4)).toBe('#12734a')
  })

  it('falls back to the theme default for an unknown tenant', () => {
    const { result } = renderHook(() => useTenantColors())
    expect(result.current.colorForTenant(99)).toBe(DEFAULT_TENANT_COLOR)
  })

  it('reads a stored color', () => {
    window.localStorage.setItem(
      TENANT_COLORS_STORAGE_KEY,
      JSON.stringify({ '1': '#ff0000' })
    )
    const { result } = renderHook(() => useTenantColors())
    expect(result.current.colorForTenant(1)).toBe('#ff0000')
    expect(result.current.colorForTenant(99)).toBe(DEFAULT_TENANT_COLOR)
  })

  it('returns a badge style with all three properties', () => {
    const { result } = renderHook(() => useTenantColors())
    const style = result.current.badgeStyleForTenant(1)
    expect(style.backgroundColor).toMatch(/^#[0-9a-f]{6}$/)
    expect(style.color).toMatch(/^#[0-9a-f]{6}$/)
    expect(style.borderColor).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('picks up a save made in the same tab', () => {
    const { result } = renderHook(() => useTenantColors())
    expect(result.current.colorForTenant(1)).toBe('#c1001f')

    act(() => {
      saveTenantColors({ '1': '#00ff00' })
    })

    expect(result.current.colorForTenant(1)).toBe('#00ff00')
  })

  it('picks up a change made in another tab', () => {
    const { result } = renderHook(() => useTenantColors())

    act(() => {
      window.localStorage.setItem(
        TENANT_COLORS_STORAGE_KEY,
        JSON.stringify({ '1': '#0000ff' })
      )
      window.dispatchEvent(new StorageEvent('storage', { key: TENANT_COLORS_STORAGE_KEY }))
    })

    expect(result.current.colorForTenant(1)).toBe('#0000ff')
  })
})
