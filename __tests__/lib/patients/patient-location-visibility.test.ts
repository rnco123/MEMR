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
    // Typed as number: the id-match comparisons below are intentional, so the
    // values must not be narrowed to non-overlapping literal types.
    const mariaDoctorId: number = 1
    const rackDoctorId: number = 2
    const encounterDoctorId: number = rackDoctorId

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
