/**
 * Civil surgeon Middle Name box must show the real middle name (from the
 * per-widget pdf_widget_values passthrough), not the full "Family Given"
 * surgeon_name string. Guard that the field is unbound from the registry map.
 */

import { REGISTRY_PASSTHROUGH_WIDGETS } from '@/lib/i693/pdfjs-form-bridge'
import { WIDGET_TEXT_TO_KEY } from '@/lib/i693/pdf-widget-map'

describe('civil surgeon middle name', () => {
  it('the Middle Name widget is registry-passthrough (not bound to surgeon_name)', () => {
    expect(
      REGISTRY_PASSTHROUGH_WIDGETS.has('form1[0].#subform[3].Pt7Line1_MiddleName[0]')
    ).toBe(true)
  })

  it('server map no longer binds Middle Name to the full name', () => {
    expect(WIDGET_TEXT_TO_KEY['Pt7Line1_MiddleName']).toBeUndefined()
  })

  it('Family and Given names still map to surgeon_name (slotted)', () => {
    expect(WIDGET_TEXT_TO_KEY['Pt7Line1_FamilyName']).toEqual({
      key: 'civil_surgeon.surgeon_name',
      slot: 'name_family',
    })
    expect(WIDGET_TEXT_TO_KEY['Pt7Line1_GivenName']).toEqual({
      key: 'civil_surgeon.surgeon_name',
      slot: 'name_given',
    })
  })
})
