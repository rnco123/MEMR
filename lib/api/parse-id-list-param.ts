/** Parse repeated or comma-separated numeric ids from query params. */
export function parseIdListParam(searchParams: URLSearchParams, ...keys: string[]): number[] {
  const raw: string[] = []
  for (const key of keys) {
    raw.push(...searchParams.getAll(key))
    const combined = searchParams.get(key)
    if (combined?.includes(',')) {
      raw.push(...combined.split(','))
    }
  }

  const ids = new Set<number>()
  for (const part of raw) {
    const id = Number(part.trim())
    if (Number.isFinite(id) && id > 0) ids.add(id)
  }
  return [...ids]
}
