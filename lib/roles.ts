// Role types and constants for role-based access control

/**
 * User role enum
 */
export enum UserRole {
  DOCTOR = 'doctor',
  NURSE = 'nurse',
  STAFF = 'staff', // Maps to nurse in application logic
}

/**
 * Role constants for backward compatibility
 */
export const ROLES = {
  DOCTOR: UserRole.DOCTOR,
  NURSE: UserRole.NURSE,
  STAFF: UserRole.STAFF,
} as const

/**
 * Role display labels
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.DOCTOR]: 'Doctor',
  [UserRole.NURSE]: 'Nurse',
  [UserRole.STAFF]: 'Staff',
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
  [UserRole.STAFF]: {
    // Staff maps to nurse permissions
    canViewAllPatients: true,
    canEditPatients: true,
    canDeletePatients: false,
    canCreateAppointments: true,
    canViewAllRecords: true,
    canManageStaff: false,
  },
}

// Utility functions
export function hasPermission(role: UserRole | null | undefined, permission: keyof RolePermissions): boolean {
  if (!role) return false
  return ROLE_PERMISSIONS[role][permission]
}

export function isValidRole(role: string | null | undefined): role is UserRole {
  // Check if role is a valid enum value
  return role === UserRole.DOCTOR || role === UserRole.NURSE || role === UserRole.STAFF
}

/**
 * Map database role to application role enum
 * Maps 'staff' to 'nurse' for application logic
 */
export function mapRoleToEnum(role: string | null | undefined): UserRole | null {
  if (role == null) return null
  const r = String(role).trim().toLowerCase()
  if (!r) return null

  if (r === UserRole.DOCTOR || r === 'doctor') {
    return UserRole.DOCTOR
  }
  if (r === UserRole.NURSE || r === 'nurse' || r === UserRole.STAFF || r === 'staff') {
    return UserRole.NURSE // Map staff to nurse
  }

  return null
}

export function getRoleLabel(role: UserRole | null | undefined): string {
  if (!role || !isValidRole(role)) return 'Unknown'
  return ROLE_LABELS[role]
}
