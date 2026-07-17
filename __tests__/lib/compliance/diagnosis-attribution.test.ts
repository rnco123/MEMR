jest.mock('@/lib/api-error-handler', () => ({
  AuthorizationError: class AuthorizationError extends Error {},
}))

import type { SupabaseClient } from '@supabase/supabase-js'
import { loadDiagnosesForCompliance } from '@/lib/compliance/load-compliance-dashboard'

type QueryResult = { data: unknown[]; error: null }

function query(result: QueryResult) {
  const builder = {
    select: jest.fn(),
    eq: jest.fn(),
    contains: jest.fn(),
    order: jest.fn(),
    in: jest.fn(),
    then: (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject),
  }

  for (const method of ['select', 'eq', 'contains', 'order', 'in'] as const) {
    builder[method].mockReturnValue(builder)
  }
  return builder
}

describe('compliance diagnosis attribution', () => {
  it('joins persisted ICD data to the exact creation audit actor', async () => {
    const admin = {
      from: jest.fn((table: string) => {
        if (table === 'encounter_diagnoses') {
          return query({
            data: [
              {
                id: 31,
                diagnosis: { icd_code: 'E11.9', description: 'Type 2 diabetes mellitus' },
              },
              {
                id: 32,
                diagnosis: { icd_code: 'I10', description: 'Essential hypertension' },
              },
            ],
            error: null,
          })
        }
        if (table === 'audit_logs') {
          return query({
            data: [
              {
                user_id: 'user-1',
                user_name: null,
                user_email: 'doctor@example.com',
                metadata: { encounter_diagnosis_id: 31 },
              },
              {
                user_id: null,
                user_name: null,
                user_email: 'nurse@example.com',
                metadata: { encounter_diagnosis_id: '32' },
              },
            ],
            error: null,
          })
        }
        if (table === 'profiles') {
          return query({
            data: [{ id: 'profile-1', uid: 'user-1', full_name: 'Dr. Rivera', role: 'doctor' }],
            error: null,
          })
        }
        if (table === 'doctors') return query({ data: [], error: null })
        throw new Error(`Unexpected table: ${table}`)
      }),
    } as unknown as SupabaseClient

    await expect(loadDiagnosesForCompliance(admin, 77)).resolves.toEqual([
      {
        id: 31,
        icdCode: 'E11.9',
        description: 'Type 2 diabetes mellitus',
        addedBy: 'Dr. Rivera',
      },
      {
        id: 32,
        icdCode: 'I10',
        description: 'Essential hypertension',
        addedBy: 'nurse@example.com',
      },
    ])
  })

  it('uses an explicit fallback when no creation audit exists', async () => {
    const admin = {
      from: jest.fn((table: string) => {
        if (table === 'encounter_diagnoses') {
          return query({
            data: [{ id: 41, diagnosis: { icd_code: 'Z00.00', description: 'General exam' } }],
            error: null,
          })
        }
        if (table === 'audit_logs') return query({ data: [], error: null })
        throw new Error(`Unexpected table: ${table}`)
      }),
    } as unknown as SupabaseClient

    await expect(loadDiagnosesForCompliance(admin, 88)).resolves.toEqual([
      {
        id: 41,
        icdCode: 'Z00.00',
        description: 'General exam',
        addedBy: 'Unknown user',
      },
    ])
  })
})
