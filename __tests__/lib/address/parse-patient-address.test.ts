import { splitAddressForPatientRecord } from '@/lib/address/parse-patient-address'

describe('splitAddressForPatientRecord', () => {
  it('splits Smarty-style US address into street, state, zip', () => {
    expect(
      splitAddressForPatientRecord('123 Main St, Houston, TX 77002')
    ).toEqual({
      street_address: '123 Main St, Houston',
      state: 'TX',
      zip_code: '77002',
    })
  })

  it('handles full state name and ZIP+4', () => {
    const result = splitAddressForPatientRecord('456 Oak Ave, Dallas, Texas 75201-1234, United States')
    expect(result.state).toBe('TX')
    expect(result.zip_code).toBe('75201-1234')
    expect(result.street_address).toContain('456 Oak Ave')
    expect(result.street_address).toContain('Dallas')
  })
})
