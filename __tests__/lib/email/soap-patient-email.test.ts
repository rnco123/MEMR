import { buildSoapPatientEmail } from '@/lib/email/soap-patient-email'

describe('buildSoapPatientEmail', () => {
  it('includes all SOAP sections in html and text', () => {
    const { subject, html, text } = buildSoapPatientEmail({
      encounterId: 42,
      encounterCode: 'ENC-42',
      patientName: 'Jane Doe',
      visitDate: 'June 8, 2026',
      doctor: { id: 1, name: 'Dr. Smith', phone: null, email: null, specialty: null, npi: null },
      clinic: {
        locationId: 1,
        name: 'Main Clinic',
        address: null,
        phone: '555-0100',
        email: 'clinic@example.com',
      },
      soap: {
        subjective_text: 'Headache',
        objective_text: 'BP normal',
        assessment_text: 'Tension headache',
        plan_text: 'Rest and fluids',
      },
    })

    expect(subject).toContain('Jane Doe')
    expect(subject).toContain('ENC-42')
    expect(html).toContain('Subjective')
    expect(html).toContain('Headache')
    expect(html).toContain('Assessment')
    expect(html).toContain('Tension headache')
    expect(text).toContain('Plan')
    expect(text).toContain('Rest and fluids')
  })
})
