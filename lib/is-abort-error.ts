/** Benign abort from fetch, Supabase auth locks, or navigation/unmount. */
export function isAbortError(error: unknown): boolean {
  if (error == null) return false
  if (typeof error === 'object' && 'name' in error && (error as { name: string }).name === 'AbortError') {
    return true
  }
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (error instanceof Error) {
    if (error.name === 'AbortError') return true
    const msg = error.message.toLowerCase()
    if (msg.includes('signal is aborted') || msg.includes('aborted without reason')) return true
  }
  return false
}
