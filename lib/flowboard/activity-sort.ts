/** Pick the latest ISO timestamp from candidates (created/updated activity). */
export function latestActivityTimestamp(
  ...candidates: Array<string | null | undefined>
): string {
  let latest = ''
  let latestMs = 0
  for (const value of candidates) {
    if (!value?.trim()) continue
    const ms = new Date(value).getTime()
    if (!Number.isFinite(ms)) continue
    if (ms >= latestMs) {
      latestMs = ms
      latest = value
    }
  }
  return latest
}

export function compareActivityDesc(
  a: { activity_at?: string | null; created_at?: string | null },
  b: { activity_at?: string | null; created_at?: string | null }
): number {
  const aMs = new Date(a.activity_at ?? a.created_at ?? 0).getTime()
  const bMs = new Date(b.activity_at ?? b.created_at ?? 0).getTime()
  return bMs - aMs
}
