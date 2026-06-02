import { mapRoleToEnum, UserRole } from '@/lib/roles'

/** Roles that may list and manage I-693 immigration cases (including admin panel). */
export const I693_API_ALLOWED_ROLES = new Set(['admin', 'doctor', 'nurse', 'staff'])

export function isI693ApiRole(role: string | null | undefined): boolean {
  const mapped = mapRoleToEnum(role)
  if (mapped === UserRole.ADMIN || mapped === UserRole.DOCTOR || mapped === UserRole.NURSE) {
    return true
  }
  const r = role?.trim().toLowerCase()
  return r === 'staff'
}
