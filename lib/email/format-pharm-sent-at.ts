import type { Language } from '@/lib/i18n'

const CENTRAL_TZ = 'America/Chicago'

export function formatPharmEmailSentAtCentral(
  isoUtc: string,
  language: Language
): string {
  const date = new Date(isoUtc)
  if (Number.isNaN(date.getTime())) return isoUtc

  const locale = language === 'es' ? 'es-US' : 'en-US'
  const formatted = new Intl.DateTimeFormat(locale, {
    timeZone: CENTRAL_TZ,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)

  return `${formatted} CT`
}
