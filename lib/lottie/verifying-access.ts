let cached: object | null = null
let loading: Promise<object | null> | null = null

/** Shared Lottie payload — fetched once per session. */
export function loadVerifyingAccessAnimation(): Promise<object | null> {
  if (cached) return Promise.resolve(cached)
  if (loading) return loading

  loading = fetch('/lottie/verifying-access.json')
    .then(async (res) => {
      if (!res.ok) return null
      const data = await res.json().catch(() => null)
      if (!data || typeof data !== 'object' || !('v' in data)) return null
      return data as object
    })
    .then((data) => {
      cached = data
      return data
    })
    .catch(() => null)

  return loading
}
