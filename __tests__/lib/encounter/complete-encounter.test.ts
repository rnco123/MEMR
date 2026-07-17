jest.mock('@/lib/api-error-handler', () => ({
  ValidationError: class ValidationError extends Error {},
}))

import { canDoctorCompleteEncounter } from '@/lib/encounter/complete-encounter'

describe('canDoctorCompleteEncounter', () => {
  it.each(['in_consultation', 'consultation_concluded', 'final_review'])(
    'allows the existing completion status %s',
    (status) => {
      expect(canDoctorCompleteEncounter(status)).toBe(true)
    }
  )

  it('allows an I-693 encounter to be completed after vitals', () => {
    expect(canDoctorCompleteEncounter('vitals_assessed', { isI693: true })).toBe(true)
  })

  it('does not skip consultation for a non-I-693 encounter', () => {
    expect(canDoctorCompleteEncounter('vitals_assessed')).toBe(false)
  })

  it('does not allow I-693 completion before vitals', () => {
    expect(canDoctorCompleteEncounter('provider_assigned', { isI693: true })).toBe(false)
  })
})
