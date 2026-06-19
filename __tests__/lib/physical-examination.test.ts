import {
  canEditPhysicalExamination,
  isPhysicalExaminationLocked,
  mergePhysicalExamination,
  normalizePhysicalExamination,
} from '@/lib/encounter/physical-examination'

describe('physical examination edit rules', () => {
  it('allows nurse/staff/admin before consultation ends', () => {
    expect(canEditPhysicalExamination('appointment_initiated', 'nurse')).toBe(true)
    expect(canEditPhysicalExamination('vitals_assessed', 'staff')).toBe(true)
    expect(canEditPhysicalExamination('in_consultation', 'admin')).toBe(true)
  })

  it('blocks after consultation_concluded and for doctors', () => {
    expect(canEditPhysicalExamination('consultation_concluded', 'nurse')).toBe(false)
    expect(canEditPhysicalExamination('final_review', 'nurse')).toBe(false)
    expect(canEditPhysicalExamination('vitals_assessed', 'doctor')).toBe(false)
    expect(isPhysicalExaminationLocked('completed')).toBe(true)
  })

  it('merges legacy ma findings into remarks', () => {
    expect(mergePhysicalExamination({}, ' prior note ')).toEqual({ remarks: 'prior note' })
    expect(
      normalizePhysicalExamination({ general_appearance: 'Well nourished', remarks: '' })
    ).toEqual({ general_appearance: 'Well nourished' })
  })
})
