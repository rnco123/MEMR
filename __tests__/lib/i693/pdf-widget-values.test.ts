import { EMPTY_I693_FORM } from '@/lib/i693/types'
import { mergePdfWidgetValuesIntoForm } from '@/lib/i693/pdf-widget-values'

const XRAY_TAKEN =
  'form1[0].#subform[5].Pt8Line1A3_XrayTakenDate[0]' as const

describe('mergePdfWidgetValuesIntoForm', () => {
  it('drops cleared passthrough widgets when respectUserClears is true', () => {
    const form = {
      ...EMPTY_I693_FORM,
      pdf_widget_values: {
        [XRAY_TAKEN]: '4',
        'form1[0].#subform[3].Pt7Line1_MiddleName[0]': 'JORDAN',
      },
    }

    mergePdfWidgetValuesIntoForm(
      form,
      { [XRAY_TAKEN]: '' },
      { respectUserClears: true }
    )

    expect(form.pdf_widget_values?.[XRAY_TAKEN]).toBeUndefined()
    expect(form.pdf_widget_values?.['form1[0].#subform[3].Pt7Line1_MiddleName[0]']).toBe(
      'JORDAN'
    )
  })

  it('keeps stale passthrough values when respectUserClears is false', () => {
    const form = {
      ...EMPTY_I693_FORM,
      pdf_widget_values: { [XRAY_TAKEN]: '4' },
    }

    mergePdfWidgetValuesIntoForm(form, {}, { respectUserClears: false })

    expect(form.pdf_widget_values?.[XRAY_TAKEN]).toBe('4')
  })

  it('removes pdf_widget_values entirely when the last entry is cleared', () => {
    const form = {
      ...EMPTY_I693_FORM,
      pdf_widget_values: { [XRAY_TAKEN]: '4' },
    }

    mergePdfWidgetValuesIntoForm(form, { [XRAY_TAKEN]: '' }, { respectUserClears: true })

    expect(form.pdf_widget_values).toBeUndefined()
  })
})
