import { isValidRole, mapRoleToEnum, UserRole, getRoleLabel } from '@/lib/roles'

describe('Role utilities', () => {
  describe('isValidRole', () => {
    test('validates doctor role', () => {
      expect(isValidRole('doctor')).toBe(true)
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

  describe('getRoleLabel', () => {
    test('returns correct label for doctor', () => {
      expect(getRoleLabel(UserRole.DOCTOR)).toBe('Doctor')
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
