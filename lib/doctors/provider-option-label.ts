import { mapRoleToEnum, UserRole } from '@/lib/roles'

type ProviderOption = {
  full_name: string
  specialty?: string | null
  role?: string | null
  is_available?: boolean
}

/** Assign-provider dropdown label, e.g. "Jane Smith · FNP — Unavailable". */
export function formatProviderOptionLabel(
  provider: ProviderOption,
  unavailableLabel: string
): string {
  const role = mapRoleToEnum(provider.role)
  let label = provider.full_name
  if (provider.specialty) label += ` (${provider.specialty})`
  if (role === UserRole.FNP) label += ' · FNP'
  if (role === UserRole.PA) label += ' · PA'
  if (provider.is_available === false) label += ` — ${unavailableLabel}`
  return label
}
