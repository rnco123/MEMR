/**
 * Applicant name + A-number repeat in the header of pages 2+. Those mirror
 * widgets live in other subforms, so the page-1-only registry never filled them
 * and the editor showed a blank header. applyApplicantHeaderMirrors propagates
 * the Part 1 values to every mirror widget instance.
 */

import {
  applyApplicantHeaderMirrors,
  syncApplicantHeaderMirrorDom,
} from '@/lib/i693/pdfjs-form-bridge'
import { EMPTY_I693_FORM, mergeI693Form } from '@/lib/i693/types'

function mockPdf() {
  const calls: Array<{ id: string; value: string }> = []
  const pdf = {
    annotationStorage: {
      setValue: (id: string, v: { value?: string }) => calls.push({ id, value: v.value ?? '' }),
    },
  } as never
  return { pdf, calls }
}

const fieldObjects = {
  // Part 1 (page 1)
  'form1[0].#subform[0].Pt1Line1a_FamilyName[0]': [{ id: 'fam_p1' }],
  'form1[0].#subform[0].Pt1Line1b_GivenName[0]': [{ id: 'giv_p1' }],
  'form1[0].#subform[0].Pt1Line1c_MiddleName[0]': [{ id: 'mid_p1' }],
  'form1[0].#subform[0].#area[0].Pt1Line3e_AlienNumber[0]': [{ id: 'anum_p1' }],
  // Header mirrors on later pages
  'form1[0].#subform[1].Pt1Line1a_FamilyName[0]': [{ id: 'fam_p2' }],
  'form1[0].#subform[5].Pt1Line1a_FamilyName[0]': [{ id: 'fam_p6' }],
  'form1[0].#subform[5].Pt1Line3e_AlienNumber[0]': [{ id: 'anum_p6' }],
  // Unrelated field — must be ignored
  'form1[0].#subform[2].Pt4Line2_PreparerNameofBusinessorOrgName[0]': [{ id: 'other' }],
}

describe('applyApplicantHeaderMirrors', () => {
  it('fills the name/A-number on every page instance, not just page 1', () => {
    const data = mergeI693Form({
      ...EMPTY_I693_FORM,
      applicant: {
        ...EMPTY_I693_FORM.applicant,
        family_name: 'Alvey',
        given_name: 'Dallas',
        middle_name: 'Jordan',
        a_number: 'A-123456789',
      },
    })
    const { pdf, calls } = mockPdf()
    applyApplicantHeaderMirrors(pdf, data, fieldObjects)

    const byId = Object.fromEntries(calls.map((c) => [c.id, c.value]))
    // Family name on page 1 + both mirror pages
    expect(byId['fam_p1']).toBe('Alvey')
    expect(byId['fam_p2']).toBe('Alvey')
    expect(byId['fam_p6']).toBe('Alvey')
    // A-number normalized to digits (comb) on page 1 + mirror
    expect(byId['anum_p1']).toBe('123456789')
    expect(byId['anum_p6']).toBe('123456789')
    // Unrelated field untouched
    expect(byId['other']).toBeUndefined()
  })

  it('skips empty applicant values', () => {
    const { pdf, calls } = mockPdf()
    applyApplicantHeaderMirrors(pdf, mergeI693Form(EMPTY_I693_FORM), fieldObjects)
    expect(calls).toHaveLength(0)
  })
})

describe('syncApplicantHeaderMirrorDom', () => {
  it('copies Part 1 applicant names into continuation-page header inputs', () => {
    const layer = document.createElement('div')
    const family = document.createElement('input')
    family.setAttribute('name', 'form1[0].#subform[1].Pt1Line1a_FamilyName[1]')
    const given = document.createElement('input')
    given.setAttribute('name', 'form1[0].#subform[1].Pt1Line1b_GivenName[1]')
    layer.append(family, given)

    const data = mergeI693Form({
      ...EMPTY_I693_FORM,
      applicant: {
        ...EMPTY_I693_FORM.applicant,
        family_name: 'nesa2',
        given_name: 'mesa',
      },
    })

    syncApplicantHeaderMirrorDom(layer, data, { continuationPage: true })

    expect(family.value).toBe('nesa2')
    expect(given.value).toBe('mesa')
    expect(family.readOnly).toBe(true)
    expect(given.readOnly).toBe(true)
  })
})
