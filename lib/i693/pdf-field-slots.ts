import type { PdfTextPlacement } from '@/lib/i693/pdf-overlay-uscis-012025'

const PHONE_SEP = '\u0001'
/** Preserves empty family vs empty given when only one name part is set (see joinPersonName). */
const NAME_SEP = '\u0002'

export function splitPersonName(full: string): { family: string; given: string } {
  if (full.includes(NAME_SEP)) {
    const idx = full.indexOf(NAME_SEP)
    return {
      family: full.slice(0, idx),
      given: full.slice(idx + NAME_SEP.length),
    }
  }
  const t = full.trim()
  if (!t) return { family: '', given: '' }
  const i = t.indexOf(' ')
  if (i < 0) return { family: t, given: '' }
  return { family: t.slice(0, i), given: t.slice(i + 1).trim() }
}

export function joinPersonName(family: string, given: string): string {
  const f = family.trim()
  const g = given.trim()
  if (!f && !g) return ''
  // Space form when both parts are set (legacy + readable in digital form).
  if (f && g) return `${f} ${g}`
  // Explicit slots when one side is blank so print/export cannot swap them.
  return `${f}${NAME_SEP}${g}`
}

export function splitDualPhone(full: string): { day: string; mobile: string } {
  if (full.includes(PHONE_SEP)) {
    const [day, mobile] = full.split(PHONE_SEP)
    return { day: day ?? '', mobile: mobile ?? '' }
  }
  return { day: full.trim(), mobile: '' }
}

export function joinDualPhone(day: string, mobile: string): string {
  if (day.trim() && mobile.trim()) return `${day.trim()}${PHONE_SEP}${mobile.trim()}`
  return day.trim() || mobile.trim()
}

export function readSlottedValue(
  root: Record<string, unknown>,
  placement: Pick<PdfTextPlacement, 'key' | 'slot'>
): string {
  const raw = getNested(root, placement.key)
  const s = raw == null ? '' : String(raw)
  if (!placement.slot) return s

  if (placement.slot === 'name_family') return splitPersonName(s).family
  if (placement.slot === 'name_given') return splitPersonName(s).given
  if (placement.slot === 'phone_day') return splitDualPhone(s).day
  if (placement.slot === 'phone_mobile') return splitDualPhone(s).mobile
  return s
}

export function writeSlottedValue(
  root: Record<string, unknown>,
  placement: Pick<PdfTextPlacement, 'key' | 'slot'>,
  nextPart: string
): void {
  const full = getNested(root, placement.key)
  const base = full == null ? '' : String(full)

  if (placement.slot === 'name_family') {
    const { given } = splitPersonName(base)
    setNested(root, placement.key, joinPersonName(nextPart, given))
    return
  }
  if (placement.slot === 'name_given') {
    const { family } = splitPersonName(base)
    setNested(root, placement.key, joinPersonName(family, nextPart))
    return
  }
  if (placement.slot === 'phone_day') {
    const { mobile } = splitDualPhone(base)
    setNested(root, placement.key, joinDualPhone(nextPart, mobile))
    return
  }
  if (placement.slot === 'phone_mobile') {
    const { day } = splitDualPhone(base)
    setNested(root, placement.key, joinDualPhone(day, nextPart))
    return
  }
  setNested(root, placement.key, nextPart)
}

function getNested(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let cur: unknown = obj
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

function setNested(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!
    if (cur[p] == null || typeof cur[p] !== 'object') cur[p] = {}
    cur = cur[p] as Record<string, unknown>
  }
  cur[parts[parts.length - 1]!] = value
}
