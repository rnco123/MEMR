'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  TENANT_COLORS_EVENT,
  TENANT_COLORS_STORAGE_KEY,
  getTenantColor,
  loadTenantColors,
  tenantBadgeStyle,
  type TenantColorMap,
} from './tenant-colors'

/**
 * Reads the admin's tenant colors and hands back ready-to-use badge styles.
 *
 * Loaded in an effect, never during render: localStorage doesn't exist on the
 * server, so reading it during render would desync hydration.
 */
export function useTenantColors() {
  const [colors, setColors] = useState<TenantColorMap>({})

  useEffect(() => {
    setColors(loadTenantColors())

    const refresh = () => setColors(loadTenantColors())

    // `storage` covers other tabs; the custom event covers this one, since a tab
    // never receives its own `storage` event.
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === TENANT_COLORS_STORAGE_KEY) refresh()
    }

    window.addEventListener('storage', onStorage)
    window.addEventListener(TENANT_COLORS_EVENT, refresh)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(TENANT_COLORS_EVENT, refresh)
    }
  }, [])

  const colorForTenant = useCallback(
    (tenantId: number | string | null | undefined) => getTenantColor(colors, tenantId),
    [colors]
  )

  const badgeStyleForTenant = useCallback(
    (tenantId: number | string | null | undefined) =>
      tenantBadgeStyle(getTenantColor(colors, tenantId)),
    [colors]
  )

  return { colors, colorForTenant, badgeStyleForTenant }
}
