/**
 * On a manual save the reviewed PDF is authoritative. A radio/checkbox group the
 * user unchecked must clear — but switching one option to another (e.g. sex
 * male→female) must NOT blank the field just because the old widget is now off.
 */

import { markKeysToClear } from '@/lib/i693/pdfjs-form-bridge'

describe('markKeysToClear (radio-safe clearing)', () => {
  it('clears a group whose widgets are all unchecked', () => {
    const present = new Set(['applicant.sex'])
    const checked = new Set<string>()
    expect(markKeysToClear(present, checked)).toEqual(['applicant.sex'])
  })

  it('does NOT clear when the group has a checked option (male→female switch)', () => {
    // Both male and female widgets belong to applicant.sex; female is checked.
    const present = new Set(['applicant.sex'])
    const checked = new Set(['applicant.sex'])
    expect(markKeysToClear(present, checked)).toEqual([])
  })

  it('clears only the fully-unchecked groups, keeps the checked ones', () => {
    const present = new Set([
      'applicant.sex',
      'tb_screening.classification',
      'civil_surgeon.vaccinations_complete',
    ])
    const checked = new Set(['tb_screening.classification'])
    expect(markKeysToClear(present, checked).sort()).toEqual(
      ['applicant.sex', 'civil_surgeon.vaccinations_complete'].sort()
    )
  })

  it('clears nothing when no mark widgets are present', () => {
    expect(markKeysToClear(new Set(), new Set())).toEqual([])
  })
})
