import {
  joinPersonName,
  readSlottedValue,
  splitPersonName,
  writeSlottedValue,
} from '@/lib/i693/pdf-field-slots'

describe('splitPersonName / joinPersonName', () => {
  it('round-trips both parts with a space (legacy)', () => {
    expect(joinPersonName('ALVEY', 'DALLAS')).toBe('ALVEY DALLAS')
    expect(splitPersonName('ALVEY DALLAS')).toEqual({ family: 'ALVEY', given: 'DALLAS' })
  })

  it('keeps given name when family is cleared (civil surgeon export bug)', () => {
    const stored = joinPersonName('', 'DALLAS')
    expect(splitPersonName(stored)).toEqual({ family: '', given: 'DALLAS' })
    expect(readSlottedValue({ civil_surgeon: { surgeon_name: stored } }, {
      key: 'civil_surgeon.surgeon_name',
      slot: 'name_family',
    })).toBe('')
    expect(readSlottedValue({ civil_surgeon: { surgeon_name: stored } }, {
      key: 'civil_surgeon.surgeon_name',
      slot: 'name_given',
    })).toBe('DALLAS')
  })

  it('keeps family name when given is cleared', () => {
    const stored = joinPersonName('ALVEY', '')
    expect(splitPersonName(stored)).toEqual({ family: 'ALVEY', given: '' })
  })

  it('writeSlottedValue clearing family does not move given into family on re-read', () => {
    const root: Record<string, unknown> = {
      civil_surgeon: { surgeon_name: 'ALVEY DALLAS' },
    }
    writeSlottedValue(root, { key: 'civil_surgeon.surgeon_name', slot: 'name_family' }, '')
    expect(readSlottedValue(root, { key: 'civil_surgeon.surgeon_name', slot: 'name_family' })).toBe('')
    expect(readSlottedValue(root, { key: 'civil_surgeon.surgeon_name', slot: 'name_given' })).toBe(
      'DALLAS'
    )
  })
})
