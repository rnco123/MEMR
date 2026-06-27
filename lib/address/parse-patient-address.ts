import { normalizeStateAbbrev, parseAddressComponents } from '@/lib/i693/ai-fill'

export type PatientAddressFields = {
  street_address: string
  state: string
  zip_code: string
}

/** Split a full US address string into patient table fields (street+city, state, zip). */
export function splitAddressForPatientRecord(fullAddress: string): PatientAddressFields {
  const trimmed = fullAddress.trim()
  if (!trimmed) {
    return { street_address: '', state: '', zip_code: '' }
  }

  const parsed = parseAddressComponents(trimmed)
  const streetLine = [parsed.street, parsed.apt].filter(Boolean).join(' ').trim()

  let street_address = ''
  if (streetLine && parsed.city) {
    street_address = `${streetLine}, ${parsed.city}`
  } else if (streetLine) {
    street_address = streetLine
  } else if (parsed.city) {
    street_address = parsed.city
  } else {
    street_address = trimmed
      .replace(/\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\s*$/i, '')
      .replace(/,\s*(United States(?: of America)?|USA)\s*$/i, '')
      .trim()
      .replace(/,\s*$/, '')
  }

  return {
    street_address,
    state: normalizeStateAbbrev(parsed.state),
    zip_code: parsed.zip,
  }
}
