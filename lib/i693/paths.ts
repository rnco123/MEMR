import { mapRoleToEnum, UserRole } from '@/lib/roles'

export type I693Tab = 'workflow' | 'form' | 'pdf'

/** Base path for the I-693 hub (admin must not use /dashboard — middleware redirects it). */
export function getI693BasePath(role: string | UserRole | null | undefined): string {
  const mapped = typeof role === 'string' ? mapRoleToEnum(role) : role
  return mapped === UserRole.ADMIN ? '/admin/i-693' : '/dashboard/i-693'
}

export function buildI693Href(
  basePath: string,
  options?: { encounterId?: number; tab?: I693Tab }
): string {
  const params = new URLSearchParams()
  if (options?.encounterId != null && Number.isFinite(options.encounterId)) {
    params.set('encounter', String(options.encounterId))
  }
  if (options?.tab && options.tab !== 'workflow') {
    params.set('tab', options.tab)
  }
  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

export function getI693Href(
  role: string | UserRole | null | undefined,
  options?: { encounterId?: number; tab?: I693Tab }
): string {
  return buildI693Href(getI693BasePath(role), options)
}
