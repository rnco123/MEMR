/** Split / join values for USCIS per-character PDF boxes. */

export function digitsOnly(s: string, max: number): string {
  return s.replace(/\D/g, '').slice(0, max)
}

export function alnumOnly(s: string, max: number): string {
  return s.replace(/[^0-9A-Za-z]/g, '').slice(0, max).toUpperCase()
}

export function valueToCells(value: string, count: number, mode: 'digit' | 'alnum' = 'alnum'): string[] {
  const clean =
    mode === 'digit' ? digitsOnly(value, count) : alnumOnly(value, count)
  const cells = clean.split('')
  while (cells.length < count) cells.push('')
  return cells.slice(0, count)
}

export function cellsToValue(cells: string[], mode: 'digit' | 'alnum' = 'alnum'): string {
  const joined = cells.join('')
  return mode === 'digit' ? digitsOnly(joined, cells.length) : alnumOnly(joined, cells.length)
}

/** A-Number: store with leading A; cells hold up to 9 digits. */
export function aNumberToCells(value: string): string[] {
  const digits = digitsOnly(value.replace(/^A/i, ''), 9)
  return valueToCells(digits, 9, 'digit')
}

export function cellsToANumber(cells: string[]): string {
  const digits = cellsToValue(cells, 'digit')
  return digits ? `A${digits}` : ''
}
