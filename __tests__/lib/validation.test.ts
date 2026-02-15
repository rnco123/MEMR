import { signupSchema, patientSchema } from '@/lib/validation'

describe('Validation schemas', () => {
  describe('signupSchema', () => {
    test('validates correct signup data', () => {
      const validData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'Password123!',
        role: 'doctor',
        pin: '1234',
      }

      const result = signupSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })

    test('rejects invalid email', () => {
      const invalidData = {
        name: 'John Doe',
        email: 'invalid-email',
        password: 'Password123!',
        role: 'doctor',
        pin: '1234',
      }

      const result = signupSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
    })

    test('rejects weak password', () => {
      const invalidData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'weak',
        role: 'doctor',
        pin: '1234',
      }

      const result = signupSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
    })

    test('rejects invalid role', () => {
      const invalidData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'Password123!',
        role: 'invalid',
        pin: '1234',
      }

      const result = signupSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
    })
  })

  describe('patientSchema', () => {
    test('validates correct patient data', () => {
      const validData = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '+1234567890',
      }

      const result = patientSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })

    test('rejects missing required fields', () => {
      const invalidData = {
        first_name: '',
        last_name: 'Doe',
      }

      const result = patientSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
    })
  })
})
