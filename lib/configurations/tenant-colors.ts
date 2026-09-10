/**
 * Admin → Configurations: a brand color per tenant.
 *
 * Front-end-only, like the service assignments: colors live in the admin's
 * browser (localStorage). Any color is allowed, so badges are derived from the
 * chosen hue rather than using it raw — a light tint behind darkened text keeps
 * the `bg-purple-50 / text-purple-700` look of the rest of the admin UI legible
 * whatever the admin picks (including near-white or near-black).
 */

/** Purple-600 — the admin theme's accent, used for an unrecognised tenant. */
export const DEFAULT_TENANT_COLOR = '#7c3aed'

/**
 * Each tenant's existing brand color, so a tenant starts on-brand instead of
 * generic purple.
 *
 * Copied from the patient-facing intake app (mcm-csa `lib/tenantTheme.ts`,
 * the `primary` of each theme) — MEMR can't import across repos, so these are
 * duplicated deliberately and must be updated together.
 *
 * Ids differ between the two apps: mcm-csa keys Kempwood as 2 *and* 3, while in
 * MEMR Kempwood is 3 (migration 096 removed tenant 2). Both are mapped here so
 * the color is right either way.
 */
export const TENANT_BRAND_COLORS: Readonly<Record<string, string>> = {
  '1': '#c1001f', // Clinica San Miguel
  '2': '#1b6b93', // Kempwood (mcm-csa's config id)
  '3': '#1b6b93', // Kempwood (MEMR's locations id)
  '4': '#12734a', // Loop / the clinic
}

/** Quick-pick swatches shown beside the full color picker. */
export const BRAND_COLOR_PRESETS: ReadonlyArray<{ name: string; color: string }> = [
  { name: 'Clinica San Miguel', color: '#c1001f' },
  { name: 'Kempwood Clinic', color: '#1b6b93' },
  { name: 'Loop', color: '#12734a' },
  { name: 'MEMR purple', color: DEFAULT_TENANT_COLOR },
]

/** The color a tenant falls back to when the admin hasn't chosen one. */
export function getTenantBrandColor(tenantId: number | string | null | undefined): string {
  if (tenantId == null) return DEFAULT_TENANT_COLOR
  return TENANT_BRAND_COLORS[String(tenantId)] ?? DEFAULT_TENANT_COLOR
}

export const TENANT_COLORS_STORAGE_KEY = 'memr.admin.tenant-colors.v1'

/** Fired on `window` after a save so same-tab listeners can refresh. */
export const TENANT_COLORS_EVENT = 'memr:tenant-colors-changed'

/** tenantId (as string) → `#rrggbb`. */
export type TenantColorMap = Record<string, string>

/** Accepts `#abc`, `abc`, `#aabbcc`, `aabbcc`; returns lowercase `#rrggbb`. */
export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const raw = value.trim().replace(/^#/, '').toLowerCase()

  if (/^[0-9a-f]{3}$/.test(raw)) {
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`
  }
  if (/^[0-9a-f]{6}$/.test(raw)) return `#${raw}`
  return null
}

export function normalizeTenantColors(raw: unknown): TenantColorMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const colors: TenantColorMap = {}

  for (const [tenantId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d+$/.test(tenantId)) continue
    const hex = normalizeHexColor(value)
    if (hex) colors[tenantId] = hex
  }

  return colors
}

export function loadTenantColors(): TenantColorMap {
  if (typeof window === 'undefined') return {}
  try {
    const stored = window.localStorage.getItem(TENANT_COLORS_STORAGE_KEY)
    if (!stored) return {}
    return normalizeTenantColors(JSON.parse(stored))
  } catch {
    return {}
  }
}

export function saveTenantColors(colors: TenantColorMap): boolean {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(
      TENANT_COLORS_STORAGE_KEY,
      JSON.stringify(normalizeTenantColors(colors))
    )
  } catch {
    return false
  }
  // A failure to notify doesn't undo the save, so it must not change the result.
  try {
    window.dispatchEvent(new Event(TENANT_COLORS_EVENT))
  } catch {
    /* ignore */
  }
  return true
}

/** The admin's pick if there is one, else the tenant's brand color. */
export function getTenantColor(
  colors: TenantColorMap,
  tenantId: number | string | null | undefined
): string {
  if (tenantId == null) return DEFAULT_TENANT_COLOR
  return colors[String(tenantId)] ?? getTenantBrandColor(tenantId)
}

export function setTenantColor(
  colors: TenantColorMap,
  tenantId: number | string,
  color: string
): TenantColorMap {
  const hex = normalizeHexColor(color)
  if (!hex) return colors
  return { ...colors, [String(tenantId)]: hex }
}

/** Clear a tenant's color so it falls back to its brand color. */
export function unsetTenantColor(
  colors: TenantColorMap,
  tenantId: number | string
): TenantColorMap {
  const key = String(tenantId)
  if (!(key in colors)) return colors
  const next = { ...colors }
  delete next[key]
  return next
}

// ---- color math -------------------------------------------------------------

type Hsl = { h: number; s: number; l: number }

function hexToHsl(hex: string): Hsl {
  const value = normalizeHexColor(hex) ?? DEFAULT_TENANT_COLOR
  const r = parseInt(value.slice(1, 3), 16) / 255
  const g = parseInt(value.slice(3, 5), 16) / 255
  const b = parseInt(value.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  const l = (max + min) / 2

  if (delta === 0) return { h: 0, s: 0, l }

  const s = delta / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === r) h = ((g - b) / delta) % 6
  else if (max === g) h = (b - r) / delta + 2
  else h = (r - g) / delta + 4

  h *= 60
  if (h < 0) h += 360
  return { h, s, l }
}

function hslToHex({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2

  let rgb: [number, number, number]
  if (h < 60) rgb = [c, x, 0]
  else if (h < 120) rgb = [x, c, 0]
  else if (h < 180) rgb = [0, c, x]
  else if (h < 240) rgb = [0, x, c]
  else if (h < 300) rgb = [x, 0, c]
  else rgb = [c, 0, x]

  const toHex = (channel: number) =>
    Math.round(Math.min(1, Math.max(0, channel + m)) * 255)
      .toString(16)
      .padStart(2, '0')

  return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`
}

/** Very light wash used as a badge background (think `bg-purple-50`). */
export function tenantTintColor(hex: string): string {
  const { h, s } = hexToHsl(hex)
  return hslToHex({ h, s: s === 0 ? 0 : Math.min(s, 0.85), l: 0.955 })
}

/** Relative luminance (WCAG 2.x) of a `#rrggbb` color. */
function relativeLuminance(hex: string): number {
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
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** WCAG AA for normal-size text. */
const MIN_CONTRAST = 4.5

/**
 * Darkened text color that stays readable on the tint (think `text-purple-700`).
 *
 * Clamping HSL lightness alone isn't enough: lightness is not perceptual, so a
 * yellow at L=36% is still far brighter than a blue at the same value. Darken
 * step by step until the measured contrast against the tint clears AA, which
 * holds the tenant's hue while guaranteeing legibility for any picked color.
 */
export function tenantTextColor(hex: string): string {
  const { h, s } = hexToHsl(hex)
  const saturation = s === 0 ? 0 : Math.max(s, 0.35)
  const tint = tenantTintColor(hex)

  let lightness = Math.min(hexToHsl(hex).l, 0.36)
  let candidate = hslToHex({ h, s: saturation, l: lightness })

  while (contrastRatio(candidate, tint) < MIN_CONTRAST && lightness > 0) {
    lightness = Math.max(0, lightness - 0.02)
    candidate = hslToHex({ h, s: saturation, l: lightness })
  }

  return candidate
}

/** Soft border a shade stronger than the tint. */
export function tenantBorderColor(hex: string): string {
  const { h, s } = hexToHsl(hex)
  return hslToHex({ h, s: s === 0 ? 0 : Math.min(s, 0.75), l: 0.86 })
}

/** Inline style for a tenant badge in the admin theme. */
export function tenantBadgeStyle(hex: string): {
  backgroundColor: string
  color: string
  borderColor: string
} {
  return {
    backgroundColor: tenantTintColor(hex),
    color: tenantTextColor(hex),
    borderColor: tenantBorderColor(hex),
  }
}
