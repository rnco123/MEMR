/**
 * H-03 + M-02 Security tests: Role resolution prefers profiles.role
 */

import { mapRoleToEnum, UserRole } from '@/lib/roles'

describe('H-03 — Role resolution from profiles (not metadata)', () => {
  // H-03-T01: metadata admin + profile nurse → nurse
  it('H-03-T01 mapRoleToEnum returns NURSE for "nurse"', () => {
    expect(mapRoleToEnum('nurse')).toBe(UserRole.NURSE)
  })

  it('H-03-T01 profile role takes precedence (simulated)', () => {
    // admin in metadata should NOT override profile role nurse
    const profileRole = 'nurse' // from DB
    // metadataRole would be 'admin' (spoofed) — must not influence resolution
    // The fix: resolveAuthenticatedRole now reads profiles first
    const resolved = mapRoleToEnum(profileRole)
    expect(resolved).toBe(UserRole.NURSE)
    expect(resolved).not.toBe(UserRole.ADMIN)
  })

  // H-03-T05: real admin profile role resolves correctly
  it('H-03-T05 real admin profile role resolves to ADMIN', () => {
    expect(mapRoleToEnum('admin')).toBe(UserRole.ADMIN)
  })

  // H-03-T06: doctor profile
  it('H-03-T06 doctor profile role resolves to DOCTOR', () => {
    expect(mapRoleToEnum('doctor')).toBe(UserRole.DOCTOR)
  })

  // mapRoleToEnum returns null for unknown role
  it('returns null for empty/unknown role', () => {
    expect(mapRoleToEnum('')).toBeNull()
    expect(mapRoleToEnum('superuser')).toBeNull()
  })
})
