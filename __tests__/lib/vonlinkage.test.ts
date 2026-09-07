/**
 * VonLinkage client — envelope handling, failure translation, and the rules
 * that keep the credential and the room name correct.
 *
 * Runs under the node environment on purpose: the module refuses to load where
 * `window` exists, which is exactly the protection being relied on, so the
 * default jsdom environment cannot import it.
 *
 * @jest-environment node
 */

const ORIGINAL_ENV = { ...process.env }

function loadClient() {
  // The module reads env at call time, but is re-imported per test so the
  // server-only import guard is exercised fresh.
  let mod: typeof import('@/lib/vonlinkage')
  jest.isolateModules(() => {
    mod = require('@/lib/vonlinkage')
  })
  return mod!
}

function mockFetchOnce(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  const response = {
    status: init.status ?? 200,
    headers: { get: (k: string) => init.headers?.[k.toLowerCase()] ?? null },
    json: async () => body,
  }
  global.fetch = jest.fn().mockResolvedValue(response) as unknown as typeof fetch
  return global.fetch as jest.Mock
}

beforeEach(() => {
  process.env = {
    ...ORIGINAL_ENV,
    VONLINKAGE_BASE_URL: 'https://von.example.com',
    VONLINKAGE_API_KEY: 'vlk_test_key_value',
  }
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  jest.restoreAllMocks()
})

describe('VonLinkage client', () => {
  it('unwraps the success envelope', async () => {
    const { createRoom } = loadClient()
    mockFetchOnce({ success: true, data: { roomName: 'appointment-7', joinUrl: 'wss://lk/x' } })

    await expect(createRoom('appointment-7')).resolves.toMatchObject({
      roomName: 'appointment-7',
      joinUrl: 'wss://lk/x',
    })
  })

  it('turns an error envelope into a VonLinkageError carrying the service code', async () => {
    const { issueJoinToken, VonLinkageError } = loadClient()
    mockFetchOnce(
      { success: false, error: { code: 'ROOM_FULL', message: 'Room is full', correlationId: 'cid-9' } },
      { status: 409 }
    )

    const error = await issueJoinToken('appointment-7', { identity: 'doctor-1', role: 'doctor' }).catch(
      (e) => e
    )

    expect(error).toBeInstanceOf(VonLinkageError)
    expect(error.code).toBe('ROOM_FULL')
    expect(error.status).toBe(409)
    expect(error.correlationId).toBe('cid-9')
  })

  it('sends the API key as a bearer token and forwards the correlation id', async () => {
    const { createRoom } = loadClient()
    const fetchMock = mockFetchOnce({ success: true, data: {} })

    await createRoom('appointment-7', {}, 'cid-forwarded')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://von.example.com/rooms')
    expect(init.headers.Authorization).toBe('Bearer vlk_test_key_value')
    expect(init.headers['x-correlation-id']).toBe('cid-forwarded')
  })

  it('prefers the correlation id VonLinkage echoes back', async () => {
    const { getRoom, VonLinkageError } = loadClient()
    mockFetchOnce(
      { success: false, error: { code: 'ROOM_NOT_FOUND', message: 'nope' } },
      { status: 404, headers: { 'x-correlation-id': 'cid-from-service' } }
    )

    const error = await getRoom('appointment-7', 'cid-local').catch((e) => e)
    expect(error).toBeInstanceOf(VonLinkageError)
    expect(error.correlationId).toBe('cid-from-service')
  })

  it('translates a transport failure into PROVIDER_UNAVAILABLE rather than leaking it', async () => {
    const { getRoom, VonLinkageError } = loadClient()
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch

    const error = await getRoom('appointment-7').catch((e) => e)
    expect(error).toBeInstanceOf(VonLinkageError)
    expect(error.code).toBe('PROVIDER_UNAVAILABLE')
    expect(error.status).toBe(502)
  })

  it('translates a non-JSON response into PROVIDER_UNAVAILABLE', async () => {
    const { getRoom, VonLinkageError } = loadClient()
    global.fetch = jest.fn().mockResolvedValue({
      status: 502,
      headers: { get: () => null },
      json: async () => {
        throw new Error('not json')
      },
    }) as unknown as typeof fetch

    const error = await getRoom('appointment-7').catch((e) => e)
    expect(error).toBeInstanceOf(VonLinkageError)
    expect(error.code).toBe('PROVIDER_UNAVAILABLE')
  })

  it('fails closed when the API key is missing, without calling out', async () => {
    delete process.env.VONLINKAGE_API_KEY
    const { createRoom, VonLinkageNotConfiguredError } = loadClient()
    const fetchMock = mockFetchOnce({ success: true, data: {} })

    await expect(createRoom('appointment-7')).rejects.toBeInstanceOf(VonLinkageNotConfiguredError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports not-configured when only the base URL is missing', () => {
    delete process.env.VONLINKAGE_BASE_URL
    const { isVonLinkageConfigured } = loadClient()
    expect(isVonLinkageConfigured()).toBe(false)
  })

  it('strips a trailing slash from the base URL so paths do not double up', async () => {
    process.env.VONLINKAGE_BASE_URL = 'https://von.example.com/'
    const { getRoom } = loadClient()
    const fetchMock = mockFetchOnce({ success: true, data: {} })

    await getRoom('appointment-7')
    expect(fetchMock.mock.calls[0][0]).toBe('https://von.example.com/rooms/appointment-7')
  })
})

describe('telemedicine room route — rules that must not regress', () => {
  const fs = require('fs') as typeof import('fs')
  const path = require('path') as typeof import('path')
  const route = fs.readFileSync(
    path.join(process.cwd(), 'app', 'api', 'telemedicine', 'room', 'route.ts'),
    'utf-8'
  )

  it('names the room after the appointment, not the encounter', () => {
    expect(route).toContain('`appointment-${encounter.appointment_id}`')
    expect(route).not.toContain('`encounter-${encounterId}`')
  })

  it('returns 409 when the encounter has no appointment, with no fallback name', () => {
    expect(route).toMatch(/appointment_id == null[\s\S]*status: 409/)
  })

  it('keeps every guard the Daily route had', () => {
    expect(route).toContain('guardEncounterAccess')
    expect(route).toContain('canJoinTelemedicine')
    expect(route).toContain('insertStatusTimeline')
    expect(route).toContain("status: 'in_consultation'")
    expect(route).toContain("action: 'video_session_started'")
    expect(route).toContain('Only physicians and nurses can join telemedicine')
  })

  it('derives the participant role from the verified profile, never the request body', () => {
    // The role handed to the token comes from toVonRole(clinicalRole), and
    // clinicalRole is resolved from fetchUserRole — not from `body`.
    expect(route).toContain('toVonRole(clinicalRole)')
    expect(route).not.toMatch(/role:\s*body\./)
    expect(route).toContain('resolveClinicalApiRole(roleInfo?.role)')
  })

  it('maps physicians to doctor and everyone else allowed through to nurse', () => {
    expect(route).toMatch(/isPhysicianRole\(clinicalRole\)\s*\?\s*'doctor'\s*:\s*'nurse'/)
  })

  it('fails closed rather than falling back to Daily when unconfigured', () => {
    expect(route).toMatch(/isVonLinkageConfigured\(\)[\s\S]*status: 500/)
  })
})
