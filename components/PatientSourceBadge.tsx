'use client'

import { useT } from '@/lib/i18n'
import {
  normalizePatientCreatedBySource,
  type PatientCreatedBySource,
} from '@/lib/patients/created-by-source'

type Props = {
  source: PatientCreatedBySource | string | null | undefined
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Badge showing whether the patient was registered via the QR app or
 * created directly by clinic staff in the EMR.
 */
export function PatientSourceBadge({ source, size = 'sm', className = '' }: Props) {
  const { t } = useT()
  const normalized = normalizePatientCreatedBySource(source)
  const isDirect = normalized === 'Direct'

  const sizeClass =
    size === 'md'
      ? 'px-2.5 py-1 text-xs'
      : 'px-2 py-0.5 text-[10px]'

  const colorClass = isDirect
    ? 'bg-amber-50 text-amber-800 border-amber-200'
    : 'bg-sky-50 text-sky-800 border-sky-200'

  const label = isDirect
    ? t('patient_source.direct')
    : t('patient_source.qr')

  const title = isDirect
    ? t('patient_source.direct_hint')
    : t('patient_source.qr_hint')

  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full border font-semibold tracking-wide uppercase ${sizeClass} ${colorClass} ${className}`}
    >
      {label}
    </span>
  )
}
