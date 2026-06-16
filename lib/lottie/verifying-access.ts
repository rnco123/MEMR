let cached: object | null = null
let loading: Promise<object | null> | null = null

/** Shared Lottie payload — fetched once per session. */
export function loadVerifyingAccessAnimation(): Promise<object | null> {
  if (cached) return Promise.resolve(cached)
  if (loading) return loading

  loading = fetch('/lottie/verifying-access.json')
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      cached = data
      return data
    })
    .catch(() => null)

  return loading
}
