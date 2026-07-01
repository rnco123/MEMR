import { occupationNameById } from '@/lib/intake/occupations'

export function formatIntakeJsonList(value: unknown): string {
  if (value == null) return ''
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      if (Array.isArray(parsed)) return parsed.map(String).join(', ')
    } catch {
      return value
    }
  }
  return String(value)
}

export function formatIntakeYesNo(value: unknown): string {
  const list = formatIntakeJsonList(value).toLowerCase()
  if (!list) return ''
  if (list.includes('yes')) return 'Yes'
  if (list.includes('no')) return 'No'
  return formatIntakeJsonList(value)
}

export function formatIntakeOccupation(value: unknown): string | null {
  if (value == null) return null
  const id = Number(value)
  if (!Number.isFinite(id)) return null
  return occupationNameById(id)
}
