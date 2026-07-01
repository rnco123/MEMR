/** Keep in sync with MaintenanceTicker HEIGHT_CLASS / globals.css --mtk-h. */
export const MAINTENANCE_TICKER_HEIGHT = '1.75rem'

const DEFAULT_MESSAGE = 'System maintenance in progress — some features may be unavailable.'

const DISABLED_VALUES = new Set(['false', '0', 'off', 'no', 'disabled'])

export function resolveMaintenanceTickerMessage(): string | null {
  const raw = process.env.NEXT_PUBLIC_MAINTENANCE_TICKER?.trim()
  if (!raw) return null
  const normalized = raw.toLowerCase()
  if (DISABLED_VALUES.has(normalized)) return null
  if (normalized === 'true') return DEFAULT_MESSAGE
  return raw
}

export function isMaintenanceTickerEnabled(): boolean {
  return resolveMaintenanceTickerMessage() !== null
}

/** Full-height app shells (admin / dashboard). */
export function maintenanceTickerShellClassName(): string {
  if (!isMaintenanceTickerEnabled()) {
    return 'h-screen supports-[height:100dvh]:h-[100dvh]'
  }
  return 'mt-7 h-[calc(100vh-1.75rem)] supports-[height:100dvh]:h-[calc(100dvh-1.75rem)]'
}

/** Fixed overlays that should sit below the ticker (video, login mobile). */
export function maintenanceTickerTopInsetClassName(): string {
  return isMaintenanceTickerEnabled() ? 'top-7' : 'top-0'
}
