import {
  canEditPhysicalExamination,
  getExamSystemStatus,
  getRosSystemStatus,
  isPhysicalExaminationLocked,
  mergePhysicalExamination,
  normalizePhysicalExamination,
  normalizeRosExamData,
} from '@/lib/encounter/physical-examination'

describe('physical examination edit rules', () => {
  it('allows clinical staff (nurse/staff) before consultation ends', () => {
    expect(canEditPhysicalExamination('appointment_initiated', 'nurse')).toBe(true)
    expect(canEditPhysicalExamination('vitals_assessed', 'staff')).toBe(true)
    expect(canEditPhysicalExamination('in_consultation', 'nurse')).toBe(true)
  })

  it('blocks non-clinical and post-consultation edits', () => {
    // Only nurse/staff document the physical exam — admins and doctors cannot.
    expect(canEditPhysicalExamination('in_consultation', 'admin')).toBe(false)
    expect(canEditPhysicalExamination('vitals_assessed', 'doctor')).toBe(false)
    expect(canEditPhysicalExamination('consultation_concluded', 'nurse')).toBe(false)
    expect(canEditPhysicalExamination('final_review', 'nurse')).toBe(false)
    expect(isPhysicalExaminationLocked('completed')).toBe(true)
  })

  it('merges legacy ma findings into remarks', () => {
    expect(mergePhysicalExamination({}, ' prior note ')).toEqual({ remarks: 'prior note' })
    expect(
      normalizePhysicalExamination({ general_appearance: 'Well nourished', remarks: '' })
    ).toEqual({ general_appearance: 'Well nourished' })
  })

  it('normalizes ros_exam_data with nested ros and exam sections', () => {
    const normalized = normalizeRosExamData({
      ros: { cons: 'N', skin: 'N', eyes: 'A' },
      exam: { general: 'N', cv: 'NA' },
      remarks: 'test',
    })
    expect(normalized.ros?.cons).toBe('N')
    expect(normalized.exam?.general).toBe('N')
    expect(getRosSystemStatus(normalized, 'cons')).toBe('N')
    expect(getExamSystemStatus(normalized, 'cv')).toBe('NA')
  })
})
