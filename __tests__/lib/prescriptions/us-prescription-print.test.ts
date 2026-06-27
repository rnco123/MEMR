import { formatUsRxMedicationLine, formatUsRxSig } from '@/lib/prescriptions/format-us-rx-sig'
import { buildUsPrescriptionPrintHtml } from '@/lib/prescriptions/us-prescription-print'
import type { PrescriptionPrintContext } from '@/lib/prescriptions/load-prescription-print-context'

const baseRx = {
  id: 1,
  patient_id: 1,
  encounter_id: 1,
  prescriber_doctor_id: 1,
  pharmacy_id: 1,
  medication_name: 'Amoxicillin',
  dosage: null,
  dosage_instruction: null,
  instructions: null,
  strength: '500 mg',
  route: 'Oral',
  frequency: 'TID',
  duration: '10 days',
  quantity: '30 tablets',
  refills: 0,
  status: 'recorded',
  notes: null,
  created_at: '2026-06-25T12:00:00.000Z',
  updated_at: '2026-06-25T12:00:00.000Z',
}

describe('formatUsRxSig', () => {
  test('uses explicit dosage instruction when present', () => {
    expect(
      formatUsRxSig({
        ...baseRx,
        dosage_instruction: 'Take 1 capsule by mouth three times daily for 10 days',
      })
    ).toBe('Take 1 capsule by mouth three times daily for 10 days')
  })

  test('builds SIG from route frequency duration', () => {
    expect(formatUsRxSig(baseRx)).toBe('Oral TID for 10 days')
  })

  test('formats medication line with strength', () => {
    expect(formatUsRxMedicationLine(baseRx)).toBe('Amoxicillin 500 mg')
  })
})

describe('buildUsPrescriptionPrintHtml', () => {
  const ctx: PrescriptionPrintContext = {
    encounterId: 42,
    appointmentDate: '2026-06-25',
    patient: {
      name: 'Doe, Jane',
      date_of_birth: '1990-01-15',
      phone: '555-0100',
      address: '123 Main St, TX, 75001',
    },
    doctor: {
      id: 7,
      name: 'Dr. Smith',
      phone: '555-0200',
      email: 'smith@clinic.test',
      specialty: 'Family Medicine',
      npi: '1234567890',
    },
    clinic: {
      locationId: 1,
      name: 'Memorial Clinic',
      address: '456 Clinic Rd',
      phone: '555-0300',
      email: 'front@clinic.test',
    },
    pharmacy: {
      name: 'Main Pharmacy',
      address: '789 Rx Ave',
      phone: '555-0400',
      email: 'rx@pharmacy.test',
    },
    prescriptions: [baseRx],
    printedAt: '2026-06-25T18:00:00.000Z',
  }

  test('includes prescriber NPI and full SIG block', () => {
    const html = buildUsPrescriptionPrintHtml(ctx)
    expect(html).toContain('1234567890')
    expect(html).toContain('Dr. Smith')
    expect(html).toContain('Amoxicillin 500 mg')
    expect(html).toContain('Sig:')
    expect(html).toContain('Oral TID for 10 days')
    expect(html).toContain('Prescription')
  })
})
