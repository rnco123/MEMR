import { stripServiceFee } from '@/lib/services/service-title'

describe('stripServiceFee', () => {
  it('drops a trailing fee and its separator', () => {
    expect(stripServiceFee('Immigration Medical Exam – $220')).toBe('Immigration Medical Exam')
    expect(stripServiceFee('Immigration Medical Exam - $220')).toBe('Immigration Medical Exam')
    expect(stripServiceFee('Examen Médico de Inmigración — $220')).toBe(
      'Examen Médico de Inmigración'
    )
  })

  it('drops a fee with no separator', () => {
    expect(stripServiceFee('Immigration Medical Exam $220')).toBe('Immigration Medical Exam')
  })

  it('handles other amounts, not just $220', () => {
    expect(stripServiceFee('Physical Exam – $75')).toBe('Physical Exam')
    expect(stripServiceFee('Panel – $1,250.00')).toBe('Panel')
  })

  it('leaves a title with no fee alone', () => {
    expect(stripServiceFee('Blood Tests')).toBe('Blood Tests')
    expect(stripServiceFee('')).toBe('')
  })

  it('does not touch a price that is not at the end', () => {
    expect(stripServiceFee('$220 exam bundle')).toBe('$220 exam bundle')
  })
})
