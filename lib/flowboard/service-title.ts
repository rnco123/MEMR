export type FlowboardServiceTitleRow = {
  service_title_en?: string | null
  service_title_es?: string | null
}

/** Localized appointment service / treatment type for flowboard rows. */
export function flowboardServiceTitle(
  row: FlowboardServiceTitleRow,
  language: 'en' | 'es',
  locationTenantId?: number | null
): string {
  const raw =
    language === 'es' && row.service_title_es
      ? row.service_title_es
      : row.service_title_en ?? row.service_title_es ?? ''
  if (locationTenantId === 3) return raw.replace(/\s*\$220\s*$/, '')
  return raw
}
