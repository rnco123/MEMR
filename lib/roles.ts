// Role types and constants for role-based access control

/**
 * User role enum
 */
export enum UserRole {
  ADMIN = 'admin',
  DOCTOR = 'doctor',
  NURSE = 'nurse',
}

/**
 * Role constants for backward compatibility
 */
export const ROLES = {
  ADMIN: UserRole.ADMIN,
  DOCTOR: UserRole.DOCTOR,
  NURSE: UserRole.NURSE,
} as const

/**
 * Role display labels
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.ADMIN]: 'Admin',
  [UserRole.DOCTOR]: 'Doctor',
  [UserRole.NURSE]: 'Nurse',
}

// Role-based permissions
export interface RolePermissions {
  canViewAllPatients: boolean
  canEditPatients: boolean
  canDeletePatients: boolean
  canCreateAppointments: boolean
  canViewAllRecords: boolean
  canManageStaff: boolean
}

export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  [UserRole.ADMIN]: {
    canViewAllPatients: true,
    canEditPatients: true,
    canDeletePatients: true,
    canCreateAppointments: true,
    canViewAllRecords: true,
    canManageStaff: true,
  },
  [UserRole.DOCTOR]: {
    canViewAllPatients: true, // Can view all patients for history
    canEditPatients: true,
    canDeletePatients: true,
    canCreateAppointments: true,
    canViewAllRecords: true, // Can view all encounters/history
    canManageStaff: true,
  },
  [UserRole.NURSE]: {
    canViewAllPatients: true, // Can view ALL patients
    canEditPatients: true,
    canDeletePatients: false,
    canCreateAppointments: true, // Can create and assign appointments to doctors
    canViewAllRecords: true, // Can view ALL encounters and full patient history
    canManageStaff: false,
  },
}

// Utility functions
export function hasPermission(role: UserRole | null | undefined, permission: keyof RolePermissions): boolean {
  if (!role) return false
  return ROLE_PERMISSIONS[role][permission]
}

export function isValidRole(role: string | null | undefined): role is UserRole {
  return (
    role === UserRole.ADMIN ||
    role === UserRole.DOCTOR ||
    role === UserRole.NURSE
  )
}

export function mapRoleToEnum(role: string | null | undefined): UserRole | null {
  if (role == null) return null
  const r = String(role).trim().toLowerCase()
  if (!r) return null
  if (r === 'admin') return UserRole.ADMIN
  if (r === 'doctor') return UserRole.DOCTOR
  // Backward compatibility for legacy records.
  if (r === 'nurse' || r === 'staff') return UserRole.NURSE
  return null
}

export function getRoleLabel(role: UserRole | null | undefined): string {
  if (!role || !isValidRole(role)) return 'Unknown'
  return ROLE_LABELS[role]
}
