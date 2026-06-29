import { prefillFromPatient } from '@/lib/i693/ai-fill'
import { mergeAcceptedI693AiDraft } from '@/lib/i693/supporting-documents/merge-draft'
import { EMPTY_I693_FORM, mergeI693Form } from '@/lib/i693/types'

describe('prefillFromPatient', () => {
  it('fills applicant name from patient record', () => {
    const form = prefillFromPatient(
      {
        first_name: 'Carlos',
        last_name: 'Ramirez',
        date_of_birth: '1990-05-15',
        gender: 'male',
        phone: '+15551234567',
        email: 'carlos@example.com',
      },
      null
    )
    expect(form.applicant.given_name).toBe('Carlos')
    expect(form.applicant.family_name).toBe('Ramirez')
    expect(form.applicant.date_of_birth).toBe('1990-05-15')
    expect(form.applicant.sex).toBe('male')
    expect(form.applicant_contact.day_phone).toBe('+15551234567')
    expect(form.applicant_contact.email).toBe('carlos@example.com')
  })
})

describe('mergeAcceptedI693AiDraft after AI fill', () => {
  it('keeps prefilled applicant name when AI returns blank applicant fields', () => {
    const base = prefillFromPatient(
      { first_name: 'Carlos', last_name: 'Ramirez' },
      null,
      EMPTY_I693_FORM
    )
    const aiDraft = mergeI693Form({
      applicant: { family_name: '', given_name: '', middle_name: '' },
      medical_history: { height: '70' },
    })
    const merged = mergeAcceptedI693AiDraft(base, aiDraft)
    expect(merged.applicant.given_name).toBe('Carlos')
    expect(merged.applicant.family_name).toBe('Ramirez')
    expect(merged.medical_history.height).toBe('70')
  })
})
