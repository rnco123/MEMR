/**
 * Date fields kept blank on prefill: Part 6 Line 3 "Dates of Follow-up
 * Examinations" (x3) and Part 8 civil surgeon "Date of Signature". They shared
 * civil_surgeon.date_signed with the real exam date (Line 2) and got stamped
 * with it. Guard both the browser and server fill paths.
 */

import { PREFILL_BLANK_WIDGETS } from '@/lib/i693/pdfjs-form-bridge'
import { WIDGET_TEXT_TO_KEY } from '@/lib/i693/pdf-widget-map'

const BLANK_WIDGET_NAMES = [
  'form1[0].#subform[3].Pt6Line3_DateofExam1[0]',
  'form1[0].#subform[3].Pt6Line3_DateofExam2[0]',
  'form1[0].#subform[3].Pt6Line3_DateofExam3[0]',
  'form1[0].#subform[4].Pt7Line8_DateofSignature[0]',
  'form1[0].#subform[5].Pt8Line1A1_QFDate[0]',
  'form1[0].#subform[5].Pt8Line1A1_TSDate[0]',
]

const UNMAPPED_SHORTS = [
  'Pt6Line3_DateofExam1',
  'Pt6Line3_DateofExam2',
  'Pt6Line3_DateofExam3',
  'Pt7Line8_DateofSignature',
  'Pt8Line1A1_QFDate',
  'Pt8Line1A1_TSDate',
]

describe('date fields that stay null by default', () => {
  it('browser fill/extract skips the follow-up, signature and blood-draw dates', () => {
    for (const name of BLANK_WIDGET_NAMES) {
      expect(PREFILL_BLANK_WIDGETS.has(name)).toBe(true)
    }
    expect(PREFILL_BLANK_WIDGETS.size).toBe(6)
  })

  it('server fill map no longer binds any of them', () => {
    for (const short of UNMAPPED_SHORTS) {
      expect(WIDGET_TEXT_TO_KEY[short]).toBeUndefined()
    }
  })

  it('the real exam date (Part 6 Line 2) still maps', () => {
    expect(WIDGET_TEXT_TO_KEY['Pt6Line2_DateoExam']?.key).toBe('civil_surgeon.date_signed')
  })
})
