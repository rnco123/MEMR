export type ComplianceDatePreset =
  | 'today'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'lastMonth'

export function complianceDateRange(preset: ComplianceDatePreset): { start: Date; end: Date } {
  const end = new Date()
  end.setHours(23, 59, 59, 999)

  const start = new Date()
  start.setHours(0, 0, 0, 0)

  switch (preset) {
    case 'today':
      break
    case 'last7':
      start.setDate(start.getDate() - 6)
      break
    case 'last30':
      start.setDate(start.getDate() - 29)
      break
    case 'thisMonth':
      start.setDate(1)
      break
    case 'lastMonth': {
      start.setMonth(start.getMonth() - 1)
      start.setDate(1)
      end.setTime(start.getTime())
      end.setMonth(end.getMonth() + 1)
      end.setDate(0)
      end.setHours(23, 59, 59, 999)
      break
    }
  }

  return { start, end }
}

export function formatTrendDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
