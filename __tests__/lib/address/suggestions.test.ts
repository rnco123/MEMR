/**
 * @jest-environment node
 */
import { fetchAddressSuggestions, isAddressLookupConfigured } from '@/lib/address/suggestions'

const ORIGINAL_TOKEN = process.env.MAPBOX_ACCESS_TOKEN

function mockSuggest(suggestions: unknown[], ok = true) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok,
    json: async () => ({ suggestions }),
  })
  global.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

beforeEach(() => {
  process.env.MAPBOX_ACCESS_TOKEN = 'pk.test-token'
})

afterEach(() => {
  jest.restoreAllMocks()
  process.env.MAPBOX_ACCESS_TOKEN = ORIGINAL_TOKEN
})

describe('isAddressLookupConfigured', () => {
  it('is true with a Mapbox token and false without one', () => {
    expect(isAddressLookupConfigured()).toBe(true)
    delete process.env.MAPBOX_ACCESS_TOKEN
    expect(isAddressLookupConfigured()).toBe(false)
  })
})

describe('fetchAddressSuggestions', () => {
  it('maps an address feature into street, city, state and zip', async () => {
    mockSuggest([
      {
        name: '1600 Smith Street',
        feature_type: 'address',
        address: '1600 Smith Street',
        full_address: '1600 Smith Street, Houston, Texas 77002, United States',
        context: {
          address: { name: '1600 Smith Street' },
          place: { name: 'Houston' },
          region: { name: 'Texas', region_code: 'TX' },
          postcode: { name: '77002' },
        },
      },
    ])

    const [result] = await fetchAddressSuggestions('1600 Smith St Houston')
    expect(result).toEqual({
      fullAddress: '1600 Smith Street, Houston, Texas 77002, United States',
      streetAddress: '1600 Smith Street, Houston',
      city: 'Houston',
      state: 'TX',
      zipCode: '77002',
    })
  })

  it('requests only address, street and poi features', async () => {
    const fetchMock = mockSuggest([])
    await fetchAddressSuggestions('1600 Smith St')
    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.searchParams.get('types')).toBe('address,street,poi')
    expect(url.searchParams.get('country')).toBe('US')
  })

  it('never puts a POI brand name into the street field', async () => {
    mockSuggest([
      {
        name: 'Walgreens',
        feature_type: 'poi',
        address: '7634 Bellaire Blvd',
        full_address: '7634 Bellaire Blvd, Houston, Texas 77036, United States',
        context: {
          address: { name: '7634 Bellaire Blvd' },
          place: { name: 'Houston' },
          region: { region_code: 'TX' },
          postcode: { name: '77036' },
        },
      },
    ])

    const [result] = await fetchAddressSuggestions('Walgreens Bellaire')
    expect(result?.streetAddress).toBe('7634 Bellaire Blvd, Houston')
    expect(result?.streetAddress).not.toContain('Walgreens')
    expect(result?.zipCode).toBe('77036')
  })

  it('keeps the street name for a street feature that has no house number', async () => {
    mockSuggest([
      {
        name: 'Houston Street',
        feature_type: 'street',
        full_address: 'Houston Street, Texarkana, Texas 75501, United States',
        context: {
          place: { name: 'Texarkana' },
          region: { region_code: 'TX' },
          postcode: { name: '75501' },
        },
      },
    ])

    const [result] = await fetchAddressSuggestions('Houston Street Texarkana')
    expect(result?.streetAddress).toBe('Houston Street, Texarkana')
  })

  it('does not repeat the city when the street line is just the city', async () => {
    mockSuggest([
      {
        name: '7700 Old River Rd South',
        feature_type: 'poi',
        address: 'Brooklet',
        full_address: 'Brooklet, Georgia 30415, United States',
        context: {
          place: { name: 'Brooklet' },
          region: { region_code: 'GA' },
          postcode: { name: '30415' },
        },
      },
    ])

    const [result] = await fetchAddressSuggestions('7700 Old River')
    expect(result?.streetAddress).toBe('Brooklet')
  })

  it('de-duplicates results that share a full address', async () => {
    const poi = (name: string) => ({
      name,
      feature_type: 'poi',
      address: '7634 Bellaire Blvd',
      full_address: '7634 Bellaire Blvd, Houston, Texas 77036, United States',
      context: { place: { name: 'Houston' }, region: { region_code: 'TX' } },
    })
    mockSuggest([poi('Walgreens'), poi('Walgreens Photo'), poi('Western Union - Walgreens')])

    const results = await fetchAddressSuggestions('Walgreens Bellaire')
    expect(results).toHaveLength(1)
  })

  it('drops entries with no usable label', async () => {
    mockSuggest([{ feature_type: 'postcode', name: '', context: {} }])
    expect(await fetchAddressSuggestions('77002')).toEqual([])
  })

  it('skips the network call for queries shorter than 3 characters', async () => {
    const fetchMock = mockSuggest([])
    expect(await fetchAddressSuggestions('ab')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns nothing when the token is missing', async () => {
    delete process.env.MAPBOX_ACCESS_TOKEN
    const fetchMock = mockSuggest([])
    expect(await fetchAddressSuggestions('1600 Smith St')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns nothing when Mapbox responds with an error', async () => {
    mockSuggest([], false)
    expect(await fetchAddressSuggestions('1600 Smith St')).toEqual([])
  })
})
