'use client'

import { useT } from '@/lib/i18n'
import { formatClinicDateTimeForLanguage } from '@/lib/datetime/clinic-timezone'
import type { EncounterSectionAuditSummary } from '@/lib/encounter/encounter-section-audit'

type Props = {
  audit: EncounterSectionAuditSummary
}

export function EncounterSectionAuditLine({ audit }: Props) {
  const { t, language } = useT()
  if (!audit?.updated_at) return null

  const when = formatClinicDateTimeForLanguage(audit.updated_at, language)
  const name = audit.editor_name || t('common.unknown')
  const roleLabel =
    audit.editor_role === 'doctor'
      ? t('encounter_modal.soap_role_doctor')
      : audit.editor_role === 'nurse' || audit.editor_role === 'staff'
        ? t('encounter_modal.soap_role_nurse')
        : audit.editor_role === 'admin'
          ? t('encounter_modal.soap_role_admin')
          : audit.editor_role || ''

  return (
    <p className="text-xs text-violet-700 mt-3 font-medium">
      {t('encounter_modal.soap_last_edited', { name, role: roleLabel, when })}
    </p>
  )
}
