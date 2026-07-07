import {
  checkboxBindingForWidget,
  pdfExportForCheckbox,
} from '@/lib/i693/pdf-widget-map'
import { isMarkWidgetChecked, wantPdfCheckboxChecked } from '@/lib/i693/pdf-checkbox-utils'

describe('checkbox PDF export values', () => {
  it('maps Part 6 overall finding B to PDF export A', () => {
    const binding = checkboxBindingForWidget('Pt6Line1_OverallFinding', 1)
    expect(binding?.when).toBe('class_b')
    expect(pdfExportForCheckbox(binding!)).toBe('A')
  })

  it('detects a checked Class B box from pdf.js export letter A', () => {
    const binding = checkboxBindingForWidget('Pt6Line1_OverallFinding', 1)!
    expect(isMarkWidgetChecked('A', binding)).toBe(true)
    expect(isMarkWidgetChecked('On', binding)).toBe(true)
    expect(isMarkWidgetChecked('class_b', binding)).toBe(true)
    expect(isMarkWidgetChecked('Off', binding)).toBe(false)
  })

  it('maps sex checkboxes to M/F export values', () => {
    expect(pdfExportForCheckbox(checkboxBindingForWidget('Pt1Line3_Gender', 0)!)).toBe('M')
    expect(pdfExportForCheckbox(checkboxBindingForWidget('Pt1Line3_Gender', 1)!)).toBe('F')
    expect(isMarkWidgetChecked('M', checkboxBindingForWidget('Pt1Line3_Gender', 0)!)).toBe(true)
  })

  it('maps vaccination complete yes/no to A/D export values', () => {
    const yes = checkboxBindingForWidget('P10_Results', 0)!
    const no = checkboxBindingForWidget('P10_Results', 1)!
    expect(pdfExportForCheckbox(yes)).toBe('A')
    expect(pdfExportForCheckbox(no)).toBe('D')
    expect(isMarkWidgetChecked('A', yes)).toBe(true)
    expect(isMarkWidgetChecked('D', no)).toBe(true)
  })

  it('detects passthrough checkbox ticks stored as PDF export letters', () => {
    expect(wantPdfCheckboxChecked('QF', 'QF')).toBe(true)
    expect(wantPdfCheckboxChecked('a', 'a')).toBe(true)
    expect(wantPdfCheckboxChecked('1', '1')).toBe(true)
    expect(wantPdfCheckboxChecked('true', 'QF')).toBe(true)
    expect(wantPdfCheckboxChecked('a', '1')).toBe(false)
  })

  it('maps syphilis screen to A/B export values', () => {
    const nonReactive = checkboxBindingForWidget('Pt8Line1B1c_SyphilisScreen', 1)!
    expect(isMarkWidgetChecked('A', nonReactive)).toBe(true)
    expect(isMarkWidgetChecked('a', nonReactive)).toBe(true)
  })

  it('detects TB Class B Other Chest Condition from PDF export value', () => {
    const binding = checkboxBindingForWidget('Pt8Line1A6_TBClassification', 6)!
    expect(binding.when).toBe('Class B Other Chest')
    expect(pdfExportForCheckbox(binding)).toBe('Class B Other Chest')
    expect(isMarkWidgetChecked('Class B Other Chest', binding)).toBe(true)
    expect(isMarkWidgetChecked('On', binding)).toBe(true)
    expect(isMarkWidgetChecked('Off', binding)).toBe(false)
  })
})
