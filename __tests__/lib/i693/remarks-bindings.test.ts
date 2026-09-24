import { PDF_FIELD_REGISTRY } from '@/lib/i693/pdf-field-registry'
import {
  FORCE_EDITABLE_WIDGET_SHORT_NAMES,
  patchForceEditableAnnotations,
} from '@/lib/i693/pdfjs-form-bridge'
import { WIDGET_TEXT_TO_KEY } from '@/lib/i693/pdf-widget-map'

const bindingFor = (shortName: string) =>
  PDF_FIELD_REGISTRY.find((b) => b.pdfFieldName.includes(`${shortName}[`))

describe('I-693 remarks boxes', () => {
  it('binds every Part 8 remarks box that has a form key', () => {
    const expected: Array<[string, string]> = [
      ['Pt8Line1A7_Remarks', 'tb_screening.remarks'],
      ['Pt8Line1B3_Remarks', 'syphilis_sti.remarks'],
      ['Pt8Line2B_Remarks', 'physical_mental.remarks'],
      ['Pt8Line3B_Remarks', 'drug_abuse.remarks'],
    ]

    for (const [shortName, key] of expected) {
      expect(WIDGET_TEXT_TO_KEY[shortName]?.key).toBe(key)
      expect(bindingFor(shortName)).toMatchObject({ key, kind: 'text' })
    }
  })

  it('keeps the Part 10 remarks boxes bound to the civil surgeon keys', () => {
    expect(bindingFor('P10_Remarks')).toMatchObject({
      key: 'civil_surgeon.vaccination_remarks',
      kind: 'text',
    })
    expect(bindingFor('P10_USCIS_Remarks')).toMatchObject({
      key: 'civil_surgeon.summary_remarks',
      kind: 'text',
    })
  })

  it('leaves the gonorrhea and Hansen’s remarks boxes to raw passthrough', () => {
    expect(WIDGET_TEXT_TO_KEY.Pt8Line1c3_Remarks).toBeUndefined()
    expect(WIDGET_TEXT_TO_KEY.Pt8Line1C2_Remarks).toBeUndefined()
  })

  it('unlocks the read-only "FOR USCIS USE ONLY" remarks box for the editor', () => {
    expect(FORCE_EDITABLE_WIDGET_SHORT_NAMES.has('P10_USCIS_Remarks')).toBe(true)

    const annotations = [
      {
        fieldName: 'form1[0].#subform[12].P10_USCIS_Remarks[0]',
        readOnly: true,
        hasOwnCanvas: true,
      },
      {
        fieldName: 'form1[0].#subform[12].P10_Remarks[0]',
        readOnly: false,
        hasOwnCanvas: false,
      },
    ]

    patchForceEditableAnnotations(annotations)

    expect(annotations[0]?.readOnly).toBe(false)
    expect(annotations[0]?.hasOwnCanvas).toBe(false)
  })
})
