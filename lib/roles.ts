// Role types and constants for role-based access control

/**
 * User role enum
 */
export enum UserRole {
  ADMIN = 'admin',
  DOCTOR = 'doctor',
  FNP = 'fnp',
  PA = 'pa',
  NURSE = 'nurse',
}

/** Roles with physician-level clinical permissions (MD, FNP, PA). */
export const PHYSICIAN_ROLE_VALUES = ['doctor', 'fnp', 'pa'] as const
export type PhysicianRoleValue = (typeof PHYSICIAN_ROLE_VALUES)[number]

export const PHYSICIAN_USER_ROLES = [UserRole.DOCTOR, UserRole.FNP, UserRole.PA] as const
export const PHYSICIAN_OR_ADMIN_ROLES = [UserRole.ADMIN, ...PHYSICIAN_USER_ROLES] as const
export const CLINICAL_DASHBOARD_ROLES = [...PHYSICIAN_USER_ROLES, UserRole.NURSE] as const
export const FULL_CLINICAL_DASHBOARD_ROLES = [UserRole.ADMIN, ...CLINICAL_DASHBOARD_ROLES] as const

/** Staff roles admins can assign when creating/editing users. */
export const ADMIN_STAFF_ROLE_VALUES = ['doctor', 'fnp', 'pa', 'nurse'] as const
export type AdminStaffRoleValue = (typeof ADMIN_STAFF_ROLE_VALUES)[number]

/** Clinical staff including legacy `staff` (mapped to nurse in app code). */
export const CLINICAL_STAFF_ROLE_VALUES = [
  ...PHYSICIAN_ROLE_VALUES,
  'nurse',
  'staff',
] as const

export const CLINICAL_STAFF_WITH_ADMIN_ROLE_VALUES = [
  ...CLINICAL_STAFF_ROLE_VALUES,
  'admin',
] as const

/** Physician + nurse + admin (consent forms, SOAP proxy, etc.). */
export const PHYSICIAN_NURSE_ADMIN_ROLE_VALUES = [
  ...PHYSICIAN_ROLE_VALUES,
  'nurse',
  'admin',
] as const

export const CLINICAL_STAFF_ROLE_SET = new Set<string>(CLINICAL_STAFF_ROLE_VALUES)
export const CLINICAL_STAFF_WITH_ADMIN_ROLE_SET = new Set<string>(CLINICAL_STAFF_WITH_ADMIN_ROLE_VALUES)
export const PHYSICIAN_NURSE_ADMIN_ROLE_SET = new Set<string>(PHYSICIAN_NURSE_ADMIN_ROLE_VALUES)

/** Valid transcript speaker_role values. */
export const TRANSCRIPT_SPEAKER_ROLE_VALUES = [
  ...PHYSICIAN_ROLE_VALUES,
  'nurse',
  'staff',
  'patient',
] as const

/**
 * Role constants for backward compatibility
 */
export const ROLES = {
  ADMIN: UserRole.ADMIN,
  DOCTOR: UserRole.DOCTOR,
  FNP: UserRole.FNP,
  PA: UserRole.PA,
  NURSE: UserRole.NURSE,
} as const

const DOCTOR_LIKE_PERMISSIONS: RolePermissions = {
  canViewAllPatients: true,
  canEditPatients: true,
  canDeletePatients: true,
  canCreateAppointments: true,
  canViewAllRecords: true,
  canManageStaff: true,
}

/**
 * Role display labels
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.ADMIN]: 'Admin',
  [UserRole.DOCTOR]: 'Doctor',
  [UserRole.FNP]: 'Family Nurse Practitioner (FNP)',
  [UserRole.PA]: 'Physician Assistant (PA)',
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
  [UserRole.DOCTOR]: DOCTOR_LIKE_PERMISSIONS,
  [UserRole.FNP]: DOCTOR_LIKE_PERMISSIONS,
  [UserRole.PA]: DOCTOR_LIKE_PERMISSIONS,
  [UserRole.NURSE]: {
    canViewAllPatients: true,
    canEditPatients: true,
    canDeletePatients: false,
    canCreateAppointments: true,
    canViewAllRecords: true,
    canManageStaff: false,
  },
}

export function isPhysicianRole(role: string | UserRole | null | undefined): boolean {
  if (role == null) return false
  return (PHYSICIAN_ROLE_VALUES as readonly string[]).includes(String(role).trim().toLowerCase())
}

/** Nurse, doctor, FNP, or PA — dashboard clinical pages (not admin). */
export function isClinicalDashboardRole(role: string | UserRole | null | undefined): boolean {
  const mapped = mapRoleToEnum(role == null ? null : String(role))
  if (!mapped) return false
  return (CLINICAL_DASHBOARD_ROLES as readonly UserRole[]).includes(mapped)
}

export function isClinicalStaffRole(role: string | null | undefined): boolean {
  if (role == null) return false
  return CLINICAL_STAFF_ROLE_SET.has(String(role).trim().toLowerCase())
}

export function isClinicalStaffWithAdminRole(role: string | null | undefined): boolean {
  if (role == null) return false
  return CLINICAL_STAFF_WITH_ADMIN_ROLE_SET.has(String(role).trim().toLowerCase())
}

/** Read encounter modal + clinical APIs (includes admin). */
export function canViewClinicalEncounterContent(role: string | null | undefined): boolean {
  return isClinicalStaffWithAdminRole(role)
}

/** Mutate encounter workflow (SOAP, rooming, etc.) — excludes admin. */
export function canEditClinicalEncounterContent(role: string | null | undefined): boolean {
  return isClinicalStaffRole(role)
}

/** Create/edit/delete prescriptions — physicians only (doctor, FNP, PA); excludes nurse/admin. */
export function canPrescribe(role: string | null | undefined): boolean {
  return isPhysicianRole(role)
}

/** Assign or create pharmacy on an encounter (includes admin). */
export function canManageEncounterPharmacy(role: string | null | undefined): boolean {
  return isClinicalStaffWithAdminRole(role)
}

export function isPhysicianNurseAdminRole(role: string | null | undefined): boolean {
  if (role == null) return false
  return PHYSICIAN_NURSE_ADMIN_ROLE_SET.has(String(role).trim().toLowerCase())
}

export function isAdminStaffRole(role: string | null | undefined): role is AdminStaffRoleValue {
  if (role == null) return false
  return (ADMIN_STAFF_ROLE_VALUES as readonly string[]).includes(role.trim().toLowerCase())
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
    role === UserRole.FNP ||
    role === UserRole.PA ||
    role === UserRole.NURSE
  )
}

export function mapRoleToEnum(role: string | null | undefined): UserRole | null {
  if (role == null) return null
  const r = String(role).trim().toLowerCase()
  if (!r) return null
  if (r === 'admin') return UserRole.ADMIN
  if (r === 'doctor') return UserRole.DOCTOR
  if (r === 'fnp') return UserRole.FNP
  if (r === 'pa') return UserRole.PA
  // Backward compatibility for legacy records.
  if (r === 'nurse' || r === 'staff') return UserRole.NURSE
  return null
}

export function getRoleLabel(role: UserRole | null | undefined): string {
  if (!role || !isValidRole(role)) return 'Unknown'
  return ROLE_LABELS[role]
}

export function getRoleLabelFromString(role: string | null | undefined): string {
  const mapped = mapRoleToEnum(role)
  if (mapped) return getRoleLabel(mapped)
  if (role === 'staff') return 'Staff'
  return role?.trim() || 'Unknown'
}

export function getRoleI18nKey(role: string | null | undefined): string {
  const mapped = mapRoleToEnum(role)
  if (mapped === UserRole.ADMIN) return 'admin.role_admin'
  if (mapped === UserRole.DOCTOR) return 'admin.role_doctor'
  if (mapped === UserRole.FNP) return 'admin.role_fnp'
  if (mapped === UserRole.PA) return 'admin.role_pa'
  if (mapped === UserRole.NURSE) return 'admin.role_nurse'
  if (role === 'staff') return 'admin.role_staff'
  return 'common.unknown'
}
