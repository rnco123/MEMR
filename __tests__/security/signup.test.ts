/**
 * C-01 Security tests: Admin self-signup prevention
 */

import { signupSchema } from '@/lib/validation'

describe('C-01 — Signup schema role restriction', () => {
  const validBase = {
    name: 'Jane Doe',
    email: 'jane@example.com',
    password: 'Test@1234',
    pin: '0000',
  }

  // C-01-T01: schema rejects admin role
  it('C-01-T01 signupSchema rejects role: "admin"', () => {
    const result = signupSchema.safeParse({ ...validBase, role: 'admin' })
    expect(result.success).toBe(false)
  })

  // C-01-T04: accepts doctor
  it('C-01-T04 signupSchema accepts role: "doctor"', () => {
    const result = signupSchema.safeParse({ ...validBase, role: 'doctor' })
    expect(result.success).toBe(true)
  })

  // C-01-T05: accepts nurse
  it('C-01-T05 signupSchema accepts role: "nurse"', () => {
    const result = signupSchema.safeParse({ ...validBase, role: 'nurse' })
    expect(result.success).toBe(true)
  })

  // C-01-T02: additional check — superuser role also rejected
  it('C-01-T02 signupSchema rejects unknown roles', () => {
    const result = signupSchema.safeParse({ ...validBase, role: 'superuser' })
    expect(result.success).toBe(false)
  })
})
