import { isEncounterCompleted } from '@/lib/encounters/access-helpers'

describe('filterEncountersForClinicalViewer rules', () => {
  test('identifies completed encounters', () => {
    expect(isEncounterCompleted('completed')).toBe(true)
    expect(isEncounterCompleted('in_consultation')).toBe(false)
  })
})

describe('physician visibility (Maria / Rack example)', () => {
  /**
   * Maria (loc 3) sees Neer's completed encounters at loc 3.
   * Rack's active encounter 6: Maria hidden until status === completed.
   * Nurses at loc 3 see active encounter 6.
   */
  test('active encounter requires assignment for non-completed physician view', () => {
    const status = 'in_consultation'
    const mariaDoctorId = 1
    const rackDoctorId = 2
    const encounterDoctorId = rackDoctorId

    const mariaCanSee = isEncounterCompleted(status)
      ? true
      : mariaDoctorId === encounterDoctorId
    const rackCanSee = isEncounterCompleted(status)
      ? true
      : rackDoctorId === encounterDoctorId

    expect(mariaCanSee).toBe(false)
    expect(rackCanSee).toBe(true)
  })

  test('completed encounter visible to any physician at location', () => {
    const status = 'completed'
    expect(isEncounterCompleted(status)).toBe(true)
  })
})
