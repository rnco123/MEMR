import type { PdfTextPlacement } from '@/lib/i693/pdf-overlay-uscis-012025'

const PHONE_SEP = '\u0001'

export function splitPersonName(full: string): { family: string; given: string } {
  const t = full.trim()
  if (!t) return { family: '', given: '' }
  const i = t.indexOf(' ')
  if (i < 0) return { family: t, given: '' }
  return { family: t.slice(0, i), given: t.slice(i + 1).trim() }
}

export function joinPersonName(family: string, given: string): string {
  return [family.trim(), given.trim()].filter(Boolean).join(' ')
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
