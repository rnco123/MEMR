export const PASSWORD_CHECKS = [
  { labelKey: 'password.criteria.min', test: (p: string) => p.length >= 8 },
  { labelKey: 'password.criteria.upper', test: (p: string) => /[A-Z]/.test(p) },
  { labelKey: 'password.criteria.lower', test: (p: string) => /[a-z]/.test(p) },
  { labelKey: 'password.criteria.number', test: (p: string) => /[0-9]/.test(p) },
  { labelKey: 'password.criteria.special', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
] as const

export function meetsPasswordCriteria(password: string): boolean {
  return PASSWORD_CHECKS.every(({ test }) => test(password))
}
