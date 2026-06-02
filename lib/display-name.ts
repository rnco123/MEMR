function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/** Turn `admin@clinic.com` → `Admin`, `jane.doe@x.com` → `Jane Doe`. */
export function displayNameFromEmail(email: string | null | undefined): string | null {
  const e = nonEmpty(email)
  if (!e) return null
  const local = e.split('@')[0]
  if (!local) return null
  return local
    .replace(/[._-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

type ResolveDisplayNameInput = {
  full_name?: string | null
  email?: string | null
  role?: string | null
  userMetadata?: Record<string, unknown> | null
  fallback?: string
}

/** Prefer profile full name, then auth metadata, then a readable name from email. */
export function resolveDisplayName({
  full_name,
  email,
  role,
  userMetadata,
  fallback = 'User',
}: ResolveDisplayNameInput): string {
  const fromProfile = nonEmpty(full_name)
  if (fromProfile) return fromProfile

  const meta =
    nonEmpty(
      typeof userMetadata?.full_name === 'string' ? userMetadata.full_name : undefined
    ) ||
    nonEmpty(typeof userMetadata?.name === 'string' ? userMetadata.name : undefined)
  if (meta) return meta

  const fromEmail = displayNameFromEmail(email)
  if (fromEmail) return fromEmail

  if (role === 'admin') return 'Administrator'
  return fallback
}
