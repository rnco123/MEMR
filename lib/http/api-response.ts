/** True when the server denied access — callers should not surface a user-facing error toast. */
export function isForbiddenResponse(status: number): boolean {
  return status === 403
}
