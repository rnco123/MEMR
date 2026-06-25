import {
  isValidRole,
  mapRoleToEnum,
  UserRole,
  getRoleLabel,
  isPhysicianRole,
  isClinicalStaffRole,
  isClinicalStaffWithAdminRole,
  isPhysicianNurseAdminRole,
  canViewClinicalEncounterContent,
  canEditClinicalEncounterContent,
  canManageEncounterPharmacy,
  CLINICAL_STAFF_ROLE_SET,
} from '@/lib/roles'

describe('Role utilities', () => {
  describe('isValidRole', () => {
    test('validates doctor role', () => {
      expect(isValidRole('doctor')).toBe(true)
    })

    test('validates fnp role', () => {
      expect(isValidRole('fnp')).toBe(true)
    })

    test('validates pa role', () => {
      expect(isValidRole('pa')).toBe(true)
    })

    test('validates nurse role', () => {
      expect(isValidRole('nurse')).toBe(true)
    })

    test('rejects legacy staff role (use mapRoleToEnum instead)', () => {
      expect(isValidRole('staff')).toBe(false)
    })

    test('rejects invalid role', () => {
      expect(isValidRole('invalid')).toBe(false)
      expect(isValidRole('')).toBe(false)
      expect(isValidRole(null)).toBe(false)
      expect(isValidRole(undefined)).toBe(false)
    })
  })

  describe('mapRoleToEnum', () => {
    test('maps doctor to DOCTOR', () => {
      expect(mapRoleToEnum('doctor')).toBe(UserRole.DOCTOR)
    })

    test('maps fnp to FNP', () => {
      expect(mapRoleToEnum('fnp')).toBe(UserRole.FNP)
    })

    test('maps pa to PA', () => {
      expect(mapRoleToEnum('pa')).toBe(UserRole.PA)
    })

    test('maps nurse to NURSE', () => {
      expect(mapRoleToEnum('nurse')).toBe(UserRole.NURSE)
    })

    test('maps staff to NURSE', () => {
      expect(mapRoleToEnum('staff')).toBe(UserRole.NURSE)
    })

    test('returns null for invalid role', () => {
      expect(mapRoleToEnum('invalid')).toBe(null)
      expect(mapRoleToEnum(null)).toBe(null)
    })
  })

  describe('isPhysicianRole', () => {
    test('includes doctor, fnp, and pa', () => {
      expect(isPhysicianRole('doctor')).toBe(true)
      expect(isPhysicianRole('fnp')).toBe(true)
      expect(isPhysicianRole('pa')).toBe(true)
    })

    test('excludes nurse and admin', () => {
      expect(isPhysicianRole('nurse')).toBe(false)
      expect(isPhysicianRole('admin')).toBe(false)
    })
  })

  describe('clinical role helpers', () => {
    test('isClinicalStaffRole includes physicians and nurses', () => {
      expect(isClinicalStaffRole('pa')).toBe(true)
      expect(isClinicalStaffRole('fnp')).toBe(true)
      expect(isClinicalStaffRole('nurse')).toBe(true)
      expect(isClinicalStaffRole('admin')).toBe(false)
    })

    test('isClinicalStaffWithAdminRole includes admin', () => {
      expect(isClinicalStaffWithAdminRole('pa')).toBe(true)
      expect(isClinicalStaffWithAdminRole('admin')).toBe(true)
    })

    test('isPhysicianNurseAdminRole matches consent/SOAP access list', () => {
      expect(isPhysicianNurseAdminRole('fnp')).toBe(true)
      expect(isPhysicianNurseAdminRole('staff')).toBe(false)
    })

    test('CLINICAL_STAFF_ROLE_SET includes fnp and pa', () => {
      expect(CLINICAL_STAFF_ROLE_SET.has('fnp')).toBe(true)
      expect(CLINICAL_STAFF_ROLE_SET.has('pa')).toBe(true)
    })

    test('canViewClinicalEncounterContent includes admin', () => {
      expect(canViewClinicalEncounterContent('admin')).toBe(true)
      expect(canViewClinicalEncounterContent('nurse')).toBe(true)
    })

    test('canEditClinicalEncounterContent excludes admin', () => {
      expect(canEditClinicalEncounterContent('admin')).toBe(false)
      expect(canEditClinicalEncounterContent('nurse')).toBe(true)
    })

    test('canManageEncounterPharmacy includes admin', () => {
      expect(canManageEncounterPharmacy('admin')).toBe(true)
      expect(canManageEncounterPharmacy('nurse')).toBe(true)
    })
  })

  describe('getRoleLabel', () => {
    test('returns correct label for doctor', () => {
      expect(getRoleLabel(UserRole.DOCTOR)).toBe('Doctor')
    })

    test('returns correct label for fnp', () => {
      expect(getRoleLabel(UserRole.FNP)).toBe('Family Nurse Practitioner (FNP)')
    })

    test('returns correct label for nurse', () => {
      expect(getRoleLabel(UserRole.NURSE)).toBe('Nurse')
    })

    test('returns Unknown for invalid role', () => {
      expect(getRoleLabel(null)).toBe('Unknown')
      expect(getRoleLabel(undefined)).toBe('Unknown')
    })
  })
})
