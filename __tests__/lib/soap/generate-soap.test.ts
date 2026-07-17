import { buildSubjectiveFromIntake, buildObjectiveFromChart } from '@/lib/soap/soap-sections'

describe('buildSubjectiveFromIntake', () => {
  it('builds a patient-reported narrative from intake fields', () => {
    const text = buildSubjectiveFromIntake({
      chief_complaint: 'Headache',
      symptoms_description: 'throbbing pain behind the eyes for 3 days',
      severity: 7,
      onset: '3 days ago',
      medical_conditions: ['hypertension'],
      allergies: ['penicillin'],
      current_medications: ['lisinopril 10mg'],
      tobacco_use: false,
      alcohol_use: true,
      fh_hypertension: true,
    })

    expect(text).toContain('Chief complaint: Headache.')
    expect(text).toContain('Patient reports throbbing pain behind the eyes for 3 days.')
    expect(text).toContain('Severity: 7/10.')
    expect(text).toContain('Past medical history: hypertension.')
    expect(text).toContain('Allergies: penicillin.')
    expect(text).toContain('Current medications: lisinopril 10mg.')
    expect(text).toContain('Social history: tobacco no, alcohol yes.')
    expect(text).toContain('Family history: hypertension.')
  })

  it('returns empty string when intake is missing or empty', () => {
    expect(buildSubjectiveFromIntake(null)).toBe('')
  })

  it('tidies patient-typed language without rephrasing the facts', () => {
    const text = buildSubjectiveFromIntake({
      chief_complaint: '  head   pain real bad. ',
      symptoms_description: 'Throbbing pain behind the eyes,  gets worse at night.. ',
      relieving_factors: 'REST AND DARK ROOMS',
    })

    // whitespace collapsed, first letter capitalized, our own period — words untouched
    expect(text).toContain('Chief complaint: Head pain real bad.')
    // leading capital lowered mid-sentence, duplicate trailing punctuation dropped
    expect(text).toContain('Patient reports throbbing pain behind the eyes, gets worse at night.')
    // SHOUTED text lowercased
    expect(text).toContain('Relieving factors: rest and dark rooms.')
  })

  it('keeps acronyms and "I" statements intact when tidying', () => {
    const text = buildSubjectiveFromIntake({
      symptoms_description: 'SOB when climbing stairs',
      chief_complaint: 'COVID exposure follow-up',
    })
    expect(text).toContain('Patient reports SOB when climbing stairs.')
    expect(text).toContain('Chief complaint: COVID exposure follow-up.')

    const iStatement = buildSubjectiveFromIntake({ symptoms_description: "I can't sleep at night" })
    expect(iStatement).toContain("Patient reports I can't sleep at night.")
  })

  it('normalizes JSON-stringified intake lists instead of printing brackets', () => {
    const text = buildSubjectiveFromIntake({
      severity: 8,
      relieving_factors: '["Rest"]',
      medical_conditions: '["no"]',
      surgeries: '["No"]',
      allergies: '["No"]',
      current_medications: '["no"]',
    })

    expect(text).toContain('Relieving factors: Rest.')
    expect(text).toContain('Past medical history: No.')
    expect(text).toContain('Surgical history: No.')
    expect(text).toContain('Allergies: No.')
    expect(text).toContain('Current medications: No.')
    expect(text).not.toContain('[')
  })
})

describe('buildObjectiveFromChart', () => {
  it('combines demographics, vitals, and physical exam findings', () => {
    const dob = new Date()
    dob.setFullYear(dob.getFullYear() - 40)
    const text = buildObjectiveFromChart({
      patient: { date_of_birth: dob.toISOString().slice(0, 10), gender: 'Female' },
      vitals: {
        bp_systolic: 128,
        bp_diastolic: 82,
        heart_rate: 74,
        temperature: 98.6,
        temperature_unit: 'F',
        spo2: 98,
        bmi: 24.35,
      },
      physicalExam: {
        general_appearance: 'Alert, no acute distress',
        cardiovascular: 'RRR, no murmurs',
      },
    })

    expect(text).toContain('Patient: 40-year-old female.')
    expect(text).toContain('BP 128/82 mmHg')
    expect(text).toContain('HR 74 bpm')
    expect(text).toContain('SpO2 98%')
    expect(text).toContain('BMI 24.4')
    expect(text).toContain('General appearance: Alert, no acute distress')
    expect(text).toContain('Cardiovascular: RRR, no murmurs')
  })

  it('returns empty string with no measured data', () => {
    expect(buildObjectiveFromChart({ patient: null, vitals: null, physicalExam: null })).toBe('')
  })

  it('skips demographics when DOB is invalid but keeps vitals', () => {
    const text = buildObjectiveFromChart({
      patient: { date_of_birth: 'not-a-date', gender: null },
      vitals: { heart_rate: 88 },
      physicalExam: null,
    })
    expect(text).not.toContain('Patient:')
    expect(text).toContain('HR 88 bpm')
  })
})
