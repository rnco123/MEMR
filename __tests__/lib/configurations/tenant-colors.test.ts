import {
  BRAND_COLOR_PRESETS,
  DEFAULT_TENANT_COLOR,
  TENANT_BRAND_COLORS,
  getTenantBrandColor,
  TENANT_COLORS_STORAGE_KEY,
  getTenantColor,
  loadTenantColors,
  normalizeHexColor,
  normalizeTenantColors,
  saveTenantColors,
  setTenantColor,
  tenantBadgeStyle,
  tenantTextColor,
  tenantTintColor,
  unsetTenantColor,
} from '@/lib/configurations/tenant-colors'

/** Relative luminance per WCAG, used to assert real contrast. */
function luminance(hex: string): number {
  const channel = (raw: number) => {
    const c = raw / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const r = channel(parseInt(hex.slice(1, 3), 16))
  const g = channel(parseInt(hex.slice(3, 5), 16))
  const b = channel(parseInt(hex.slice(5, 7), 16))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

describe('tenant colors', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  describe('normalizeHexColor', () => {
    it('accepts long and short form, with or without a hash', () => {
      expect(normalizeHexColor('#AABBCC')).toBe('#aabbcc')
      expect(normalizeHexColor('aabbcc')).toBe('#aabbcc')
      expect(normalizeHexColor('#abc')).toBe('#aabbcc')
      expect(normalizeHexColor('  #AbC  ')).toBe('#aabbcc')
    })

    it('rejects anything that is not a hex color', () => {
      expect(normalizeHexColor('#ab')).toBeNull()
      expect(normalizeHexColor('#abcde')).toBeNull()
      expect(normalizeHexColor('rebeccapurple')).toBeNull()
      expect(normalizeHexColor('#gggggg')).toBeNull()
      expect(normalizeHexColor(123)).toBeNull()
      expect(normalizeHexColor(null)).toBeNull()
    })
  })

  describe('normalizeTenantColors', () => {
    it('keeps valid entries and drops the rest', () => {
      expect(
        normalizeTenantColors({ '1': '#abc', '2': 'nope', bad: '#ffffff' })
      ).toEqual({ '1': '#aabbcc' })
    })

    it('returns an empty map for junk', () => {
      expect(normalizeTenantColors(null)).toEqual({})
      expect(normalizeTenantColors(['#fff'])).toEqual({})
    })
  })

  describe('brand defaults', () => {
    it('seeds each known tenant with its own brand color', () => {
      // Sourced from mcm-csa lib/tenantTheme.ts.
      expect(getTenantColor({}, 1)).toBe('#c1001f') // Clinica San Miguel
      expect(getTenantColor({}, 3)).toBe('#1b6b93') // Kempwood (MEMR id)
      expect(getTenantColor({}, 4)).toBe('#12734a') // Loop
    })

    it('maps both of Kempwood\'s ids to the same color', () => {
      expect(getTenantBrandColor(2)).toBe(getTenantBrandColor(3))
    })

    it('gives every known tenant a distinct color', () => {
      const distinct = new Set([1, 3, 4].map((id) => getTenantBrandColor(id)))
      expect(distinct.size).toBe(3)
    })

    it('falls back to the theme default for an unknown tenant', () => {
      expect(getTenantColor({}, 99)).toBe(DEFAULT_TENANT_COLOR)
      expect(getTenantColor({}, null)).toBe(DEFAULT_TENANT_COLOR)
    })

    it('stores every brand color as a valid hex', () => {
      for (const color of Object.values(TENANT_BRAND_COLORS)) {
        expect(color).toMatch(/^#[0-9a-f]{6}$/)
      }
    })

    it('offers every brand color as a preset swatch', () => {
      const presets = new Set(BRAND_COLOR_PRESETS.map((preset) => preset.color))
      for (const color of Object.values(TENANT_BRAND_COLORS)) {
        expect(presets.has(color)).toBe(true)
      }
    })
  })

  describe('get/set', () => {
    it('prefers the admin\'s pick over the brand default', () => {
      expect(getTenantColor({ '1': '#000000' }, 1)).toBe('#000000')
    })

    it('sets a color without mutating the input', () => {
      const base = {}
      const next = setTenantColor(base, 1, '#ff0000')
      expect(getTenantColor(next, 1)).toBe('#ff0000')
      expect(base).toEqual({})
    })

    it('ignores an invalid color rather than storing it', () => {
      const base = { '1': '#ff0000' }
      expect(setTenantColor(base, 1, 'not-a-color')).toBe(base)
    })

    it('unset returns to the brand color, not generic purple', () => {
      const next = unsetTenantColor({ '1': '#ff0000' }, 1)
      expect(getTenantColor(next, 1)).toBe('#c1001f')
    })

    it('unset is a no-op for an unset tenant', () => {
      const base = { '1': '#ff0000' }
      expect(unsetTenantColor(base, 2)).toBe(base)
    })
  })

  describe('derived badge colors', () => {
    // Any color the picker can produce, including the awkward extremes.
    const samples = [
      '#7c3aed', '#ff0000', '#00ff00', '#0000ff', '#ffffff',
      '#000000', '#ffff00', '#123456', '#808080', '#fffef0',
      ...Object.values(TENANT_BRAND_COLORS),
    ]

    it('keeps badge text readable on the tint for any color', () => {
      for (const hex of samples) {
        const { backgroundColor, color } = tenantBadgeStyle(hex)
        // 4.5:1 is the WCAG AA threshold for normal-size text.
        expect(contrastRatio(color, backgroundColor)).toBeGreaterThanOrEqual(4.5)
      }
    })

    it('produces a light tint and a dark text color', () => {
      for (const hex of samples) {
        expect(luminance(tenantTintColor(hex))).toBeGreaterThan(0.7)
        expect(luminance(tenantTextColor(hex))).toBeLessThan(0.3)
      }
    })

    it('returns valid hex triples', () => {
      for (const hex of samples) {
        const style = tenantBadgeStyle(hex)
        expect(style.backgroundColor).toMatch(/^#[0-9a-f]{6}$/)
        expect(style.color).toMatch(/^#[0-9a-f]{6}$/)
        expect(style.borderColor).toMatch(/^#[0-9a-f]{6}$/)
      }
    })

    it('keeps distinct hues distinguishable', () => {
      expect(tenantTextColor('#ff0000')).not.toBe(tenantTextColor('#0000ff'))
    })
  })

  describe('persistence', () => {
    it('round-trips through localStorage', () => {
      expect(saveTenantColors({ '1': '#ff0000' })).toBe(true)
      expect(loadTenantColors()).toEqual({ '1': '#ff0000' })
    })

    it('returns an empty map when nothing is stored', () => {
      expect(loadTenantColors()).toEqual({})
    })

    it('returns an empty map when stored JSON is corrupt', () => {
      window.localStorage.setItem(TENANT_COLORS_STORAGE_KEY, 'not json')
      expect(loadTenantColors()).toEqual({})
    })

    it('sanitizes stored values on read', () => {
      window.localStorage.setItem(
        TENANT_COLORS_STORAGE_KEY,
        JSON.stringify({ '1': '#abc', '2': 'red' })
      )
      expect(loadTenantColors()).toEqual({ '1': '#aabbcc' })
    })
  })
})
