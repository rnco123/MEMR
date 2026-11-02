import { expect, type APIRequestContext, type PlaywrightWorkerArgs } from '@playwright/test'
import { credentials } from './auth'

/** Location both test clinicians are assigned to (see README → Playwright E2E). */
const TEST_LOCATION_ID = 2

function clinicToday() {
  // Appointments are dated in clinic time (America/Chicago).
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
}

async function apiLogin(playwright: PlaywrightWorkerArgs['playwright'], baseURL: string, role: 'nurse' | 'doctor') {
  const ctx = await playwright.request.newContext({ baseURL })
  const res = await ctx.post('/api/auth/login', { data: credentials(role), timeout: 60000 })
  expect(res.ok(), `${role} API login failed: ${res.status()}`).toBeTruthy()
  return ctx
}

async function json<T>(
  ctx: APIRequestContext,
  method: 'get' | 'post' | 'patch',
  path: string,
  data?: unknown
): Promise<T> {
  // One retry: staging Supabase occasionally times out (read ETIMEDOUT) under load.
  const send = () => ctx[method](path, { data, timeout: 60000 })
  const res = await send().catch(() => send())
  expect(res.ok(), `${method.toUpperCase()} ${path} → ${res.status()} ${await res.text().catch(() => '')}`).toBeTruthy()
  return (await res.json()) as T
}

const STATUS_STEPS = [
  'provider_assigned',
  'vitals_assessed',
  'in_consultation',
  'consultation_concluded',
  'final_review',
] as const
type EncounterStep = (typeof STATUS_STEPS)[number]

/**
 * Creates a walk-in encounter for an existing staging patient and assigns it to
 * the Playwright doctor, so doctor-side specs always have an active encounter
 * on their virtual waiting room regardless of run order. `advanceTo` moves it
 * further along the clinical flow (e.g. to final_review for SOAP tests).
 */
export async function createDoctorEncounter(
  playwright: PlaywrightWorkerArgs['playwright'],
  baseURL: string,
  opts: { advanceTo?: EncounterStep } = {}
) {
  const doctor = await apiLogin(playwright, baseURL, 'doctor')
  const nurse = await apiLogin(playwright, baseURL, 'nurse')
  try {
    // Only available doctors can be assigned.
    await json(doctor, 'post', '/api/doctors/availability', { is_available: true })

    const { rows } = await json<{ rows: Array<{ id: number }> }>(
      nurse,
      'get',
      `/api/clinical/patients-history?location_id=${TEST_LOCATION_ID}`
    )
    expect(rows.length, 'No staging patients at the test location').toBeGreaterThan(0)

    const { services } = await json<{ services: Array<{ id: number }> }>(
      nurse,
      'get',
      `/api/locations/${TEST_LOCATION_ID}/services`
    )
    expect(services.length, 'No services at the test location').toBeGreaterThan(0)

    const walkIn = await json<{ data?: { appointment_id: number; encounter_id: number; patient_id: number } }>(
      nurse,
      'post',
      '/api/nurse/walk-in',
      {
        patient_id: rows[0]!.id,
        appointment_date: clinicToday(),
        service_id: services[0]!.id,
        location_id: TEST_LOCATION_ID,
      }
    )
    const created = walkIn.data
    expect(created?.encounter_id, 'walk-in returned no encounter').toBeTruthy()

    const doctorEmail = credentials('doctor').email
    const { data: doctors } = await json<{ data: Array<{ id: number; email: string | null }> }>(nurse, 'get', '/api/doctors')
    const doctorRow = doctors.find(d => d.email?.toLowerCase() === doctorEmail.toLowerCase())
    expect(doctorRow, 'Playwright doctor is not assignable at the test location').toBeTruthy()

    await json(nurse, 'post', '/api/nurse/batch-assign-provider', {
      appointment_ids: [created!.appointment_id],
      doctor_id: doctorRow!.id,
    })

    // Walk the status forward one step at a time, as the clinical flow does.
    if (opts.advanceTo) {
      const last = STATUS_STEPS.indexOf(opts.advanceTo)
      for (const step of STATUS_STEPS.slice(1, last + 1)) {
        await json(doctor, 'patch', `/api/encounters/${created!.encounter_id}/status`, { status: step })
      }
    }

    return created!
  } finally {
    await doctor.dispose()
    await nurse.dispose()
  }
}
