/**
 * C-02 Security tests: External Supabase proxy
 */

// Test the isAllowedTable logic by importing from a helper
// Since the function is module-local we test the exported helper instead.
import {
  getExternalSupabaseAllowedTables,
  isExternalSupabaseWriteAllowed,
  filterPayloadToAllowedColumns,
  getExternalSupabaseAllowedColumns,
} from '@/lib/supabase/external-keys'

describe('C-02 — External Supabase deny-by-default', () => {
  // C-02-T01: isAllowedTable behaviour when allowlist is empty
  it('C-02-T01 empty allowlist should block all tables', () => {
    const originalEnv = process.env.EXTERNAL_SUPABASE_ALLOWED_TABLES
    delete process.env.EXTERNAL_SUPABASE_ALLOWED_TABLES

    const allowlist = getExternalSupabaseAllowedTables()
    // The route now returns false when allowlist is empty (deny-by-default)
    expect(allowlist.length).toBe(0)

    process.env.EXTERNAL_SUPABASE_ALLOWED_TABLES = originalEnv
  })

  // C-02-T05: a table not in the allowlist must be blocked
  it('C-02-T05 table not in allowlist returns false', () => {
    process.env.EXTERNAL_SUPABASE_ALLOWED_TABLES = 'patients,appointments'
    const allowlist = getExternalSupabaseAllowedTables()
    expect(allowlist.includes('encounters')).toBe(false)
    expect(allowlist.includes('patients')).toBe(true)
  })

  it('C-02-T06 write mode disabled by default', () => {
    delete process.env.EXTERNAL_SUPABASE_ALLOW_WRITE
    expect(isExternalSupabaseWriteAllowed()).toBe(false)
    process.env.EXTERNAL_SUPABASE_ALLOW_WRITE = 'true'
    expect(isExternalSupabaseWriteAllowed()).toBe(true)
  })

  it('C-02-T07 column allowlist filters payload keys', () => {
    process.env.EXTERNAL_SUPABASE_COLUMNS_patients = 'id,first_name'
    const filtered = filterPayloadToAllowedColumns('patients', {
      id: 1,
      first_name: 'Jane',
      ssn: 'secret',
    }) as Record<string, unknown>
    expect(filtered).toEqual({ id: 1, first_name: 'Jane' })
    delete process.env.EXTERNAL_SUPABASE_COLUMNS_patients
  })
})
