import {
  FORCE_EDITABLE_WIDGET_SHORT_NAMES,
  patchForceEditableAnnotations,
} from '@/lib/i693/pdfjs-form-bridge'

describe('patchForceEditableAnnotations', () => {
  it('clears readOnly and hasOwnCanvas on syphilis section (c) widgets', () => {
    const annotations = [
      {
        fieldName: 'form1[0].#subform[6].Pt8Line1B1a_name[0]',
        readOnly: false,
        hasOwnCanvas: false,
      },
      {
        fieldName: 'form1[0].#subform[6].Pt8Line1B1c_DateNontreponemalTest[0]',
        readOnly: true,
        hasOwnCanvas: true,
      },
      {
        fieldName: 'form1[0].#subform[6].Pt7Line1B1c_TiterOne[0]',
        readOnly: true,
        hasOwnCanvas: true,
      },
    ]

    patchForceEditableAnnotations(annotations)

    expect(annotations[0]?.readOnly).toBe(false)
    expect(annotations[0]?.hasOwnCanvas).toBe(false)
    expect(annotations[1]?.readOnly).toBe(false)
    expect(annotations[1]?.hasOwnCanvas).toBe(false)
    expect(annotations[2]?.readOnly).toBe(false)
    expect(annotations[2]?.hasOwnCanvas).toBe(false)
  })

  it('lists the expected widget short names', () => {
    expect(FORCE_EDITABLE_WIDGET_SHORT_NAMES.has('Pt8Line1B1c_DateNontreponemalTest')).toBe(true)
    expect(FORCE_EDITABLE_WIDGET_SHORT_NAMES.has('Pt7Line1B1c_TiterOne')).toBe(true)
  })
})
