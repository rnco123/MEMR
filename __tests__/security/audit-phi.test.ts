/**
 * PHI audit helper — fire-and-forget semantics, view dedupe, crash safety.
 */

const insertMock = jest.fn().mockResolvedValue({ error: null })

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ insert: insertMock }),
  }),
}))

import { auditPhi, __clearAuditPhiDedupe } from '@/lib/audit-phi'

const user = { id: 'user-1', email: 'doc@clinic.test' }

async function flush() {
  // Let the detached insert promise settle.
  await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  insertMock.mockClear()
  __clearAuditPhiDedupe()
})

describe('auditPhi', () => {
  it('inserts a row with the caller-provided identity and role', async () => {
    auditPhi({
      user,
      role: 'doctor',
      action: 'encounter_viewed',
      resourceType: 'encounter',
      resourceId: 42,
      metadata: { section: 'detail' },
    })
    await flush()

    expect(insertMock).toHaveBeenCalledTimes(1)
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        user_email: 'doc@clinic.test',
        user_role: 'doctor',
        action: 'encounter_viewed',
        resource_type: 'encounter',
        resource_id: '42',
        metadata: { section: 'detail' },
      })
    )
  })

  it('dedupes repeated views of the same record within the window', async () => {
    for (let i = 0; i < 5; i++) {
      auditPhi({ user, action: 'encounter_viewed', resourceType: 'encounter', resourceId: 42 })
    }
    await flush()
    expect(insertMock).toHaveBeenCalledTimes(1)
  })

  it('does not dedupe views of different records or by different users', async () => {
    auditPhi({ user, action: 'patient_viewed', resourceType: 'patient', resourceId: 1 })
    auditPhi({ user, action: 'patient_viewed', resourceType: 'patient', resourceId: 2 })
    auditPhi({
      user: { id: 'user-2' },
      action: 'patient_viewed',
      resourceType: 'patient',
      resourceId: 1,
    })
    await flush()
    expect(insertMock).toHaveBeenCalledTimes(3)
  })

  it('never dedupes writes', async () => {
    for (let i = 0; i < 3; i++) {
      auditPhi({ user, action: 'encounter_updated', resourceType: 'encounter', resourceId: 42 })
    }
    await flush()
    expect(insertMock).toHaveBeenCalledTimes(3)
  })

  it('never throws when the insert fails', async () => {
    insertMock.mockRejectedValueOnce(new Error('db down'))
    expect(() =>
      auditPhi({ user, action: 'patient_updated', resourceType: 'patient', resourceId: 9 })
    ).not.toThrow()
    await flush()
  })
})
