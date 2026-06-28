import { patientSchema } from '@/lib/validation'
import {
  maxRequestBodySizeForPath,
  validateRequestSize,
} from '@/lib/security/request-validator'

describe('Validation schemas', () => {
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

describe('Request upload size validation', () => {
  function requestWithSize(pathname: string, size: number): any {
    return {
      url: `https://example.test${pathname}`,
      headers: new Headers({ 'content-length': String(size) }),
    }
  }

  test('keeps the default request body cap at 5MB', () => {
    const req = requestWithSize('/api/anything', 6 * 1024 * 1024)
    const result = validateRequestSize(req)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('5MB')
  })

  test('allows larger I-693 supporting document uploads through middleware validation', () => {
    const pathname = '/api/encounters/123/i693/supporting-documents'
    const maxBodySize = maxRequestBodySizeForPath(pathname)
    const req = requestWithSize(pathname, 6 * 1024 * 1024)
    const result = validateRequestSize(req, { maxBodySize })

    expect(maxBodySize).toBeGreaterThan(6 * 1024 * 1024)
    expect(result.valid).toBe(true)
  })
})
