import type { Language } from '@/lib/i18n'
import { formatClinicDateTimeForLanguage } from '@/lib/datetime/clinic-timezone'

export function formatPharmEmailSentAtCentral(
  isoUtc: string,
  language: Language
): string {
  const formatted = formatClinicDateTimeForLanguage(isoUtc, language, {
    intl: {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    },
  })
  return formatted || isoUtc
}
