import { prefillFromPatient, normalizeI693FormAddress, DEFAULT_US_APPLICANT_COUNTRY } from '@/lib/i693/ai-fill'
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

  it('defaults country to USA for US state and zip', () => {
    const form = prefillFromPatient(
      {
        first_name: 'Carlos',
        last_name: 'Raheel',
        state: 'TX',
        zip_code: '77054',
        street_address: '1302 Binz St',
      },
      null
    )
    expect(form.applicant.state).toBe('TX')
    expect(form.applicant.zip).toBe('77054')
    expect(form.applicant.country).toBe(DEFAULT_US_APPLICANT_COUNTRY)
  })
})

describe('normalizeI693FormAddress', () => {
  it('always fills USA for physical address country', () => {
    const form = normalizeI693FormAddress(
      mergeI693Form({
        applicant: {
          street: '1302 Binz St',
          state: 'TX',
          zip: '77054',
          country: '',
        },
      })
    )
    expect(form.applicant.country).toBe(DEFAULT_US_APPLICANT_COUNTRY)
  })

  it('does not change country of birth', () => {
    const form = normalizeI693FormAddress(
      mergeI693Form({
        applicant: {
          street: '1302 Binz St',
          state: 'TX',
          zip: '77054',
          country: '',
          country_of_birth: 'Mexico',
        },
      })
    )
    expect(form.applicant.country).toBe(DEFAULT_US_APPLICANT_COUNTRY)
    expect(form.applicant.country_of_birth).toBe('Mexico')
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
      applicant: { ...EMPTY_I693_FORM.applicant, family_name: '', given_name: '', middle_name: '' },
      medical_history: { ...EMPTY_I693_FORM.medical_history, height: '70' },
    })
    const merged = mergeAcceptedI693AiDraft(base, aiDraft)
    expect(merged.applicant.given_name).toBe('Carlos')
    expect(merged.applicant.family_name).toBe('Ramirez')
    expect(merged.medical_history.height).toBe('70')
  })

  it('fills Part 5 identification when AI detects a passport number', () => {
    const base = mergeI693Form({})
    const aiDraft = mergeI693Form({
      applicant: {
        ...EMPTY_I693_FORM.applicant,
        passport_number: 'AB1234567',
      },
    })
    const merged = mergeAcceptedI693AiDraft(base, aiDraft)
    expect(merged.applicant.passport_number).toBe('AB1234567')
    expect(merged.applicant_contact.id_document_type).toBe('Passport')
    expect(merged.applicant_contact.id_document_number).toBe('AB1234567')
  })

  it('does not overwrite an existing Part 5 ID with passport', () => {
    const base = mergeI693Form({
      applicant_contact: {
        ...EMPTY_I693_FORM.applicant_contact,
        id_document_type: "Driver's License",
        id_document_number: 'TX-998877',
      },
    })
    const aiDraft = mergeI693Form({
      applicant: {
        ...EMPTY_I693_FORM.applicant,
        passport_number: 'AB1234567',
      },
    })
    const merged = mergeAcceptedI693AiDraft(base, aiDraft)
    expect(merged.applicant_contact.id_document_type).toBe("Driver's License")
    expect(merged.applicant_contact.id_document_number).toBe('TX-998877')
  })
})
