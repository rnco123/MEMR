let cached: object | null = null
let loading: Promise<object | null> | null = null

function isLottiePayload(data: unknown): data is object {
  return data != null && typeof data === 'object' && 'v' in data
}

async function fetchPublicAnimation(): Promise<object | null> {
  try {
    const res = await fetch('/lottie/verifying-access.json')
    if (!res.ok) return null
    const data = await res.json().catch(() => null)
    if (!isLottiePayload(data)) return null
    return data
  } catch {
    return null
  }
}

/** Shared Lottie payload — bundled import with public/ fallback. */
export function loadVerifyingAccessAnimation(): Promise<object | null> {
  if (cached) return Promise.resolve(cached)
  if (loading) return loading

  loading = import('./verifying-access.animation.json')
    .then((mod) => {
      const data = mod.default
      if (isLottiePayload(data)) {
        cached = data
        return cached
      }
      return fetchPublicAnimation()
    })
    .then((data) => {
      if (data) cached = data
      return data
    })
    .catch(() => fetchPublicAnimation())
    .then((data) => {
      cached = data
      return data
    })

  return loading
}

/** Warm the animation chunk during app boot so login redirect can paint immediately. */
export function preloadVerifyingAccessAnimation(): void {
  void loadVerifyingAccessAnimation()
}
