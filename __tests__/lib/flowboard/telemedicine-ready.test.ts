import {
  compareReadySinceAsc,
  isReadyForTelemedicine,
  readyWaitMinutes,
} from '@/lib/flowboard/telemedicine-ready'

describe('isReadyForTelemedicine', () => {
  const ready = {
    encounter_id: 1,
    encounter_status: 'vitals_assessed',
    ready_for_doctor_at: '2026-09-10T15:00:00.000Z',
  }

  it('lists a patient with vitals assessed and rooming marked ready', () => {
    expect(isReadyForTelemedicine(ready)).toBe(true)
  })

  it('skips a patient the nurse has not marked ready', () => {
    expect(isReadyForTelemedicine({ ...ready, ready_for_doctor_at: null })).toBe(false)
  })

  it('skips a patient marked ready before vitals were saved', () => {
    expect(isReadyForTelemedicine({ ...ready, encounter_status: 'provider_assigned' })).toBe(false)
  })

  it('skips completed encounters', () => {
    expect(isReadyForTelemedicine({ ...ready, encounter_status: 'completed' })).toBe(false)
  })

  it('keeps a patient already in consultation so the provider can rejoin', () => {
    expect(isReadyForTelemedicine({ ...ready, encounter_status: 'in_consultation' })).toBe(true)
  })

  it('skips appointments without an encounter', () => {
    expect(isReadyForTelemedicine({ ...ready, encounter_id: null })).toBe(false)
  })
})

describe('compareReadySinceAsc', () => {
  it('puts the longest wait first', () => {
    const rows = [
      { encounter_id: 2, ready_for_doctor_at: '2026-09-10T15:30:00.000Z' },
      { encounter_id: 1, ready_for_doctor_at: '2026-09-10T15:00:00.000Z' },
    ]
    expect([...rows].sort(compareReadySinceAsc).map((r) => r.encounter_id)).toEqual([1, 2])
  })
})

describe('readyWaitMinutes', () => {
  const now = Date.parse('2026-09-10T15:12:30.000Z')

  it('floors the wait to whole minutes', () => {
    expect(readyWaitMinutes('2026-09-10T15:00:00.000Z', now)).toBe(12)
  })

  it('never returns a negative wait for a clock skew', () => {
    expect(readyWaitMinutes('2026-09-10T15:20:00.000Z', now)).toBe(0)
  })

  it('returns null without a timestamp', () => {
    expect(readyWaitMinutes(null, now)).toBeNull()
    expect(readyWaitMinutes('not-a-date', now)).toBeNull()
  })
})
