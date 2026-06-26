export type FormTemplateRow = {
  id: number
  tenant_id: number
  name: string
  is_active: boolean
  html: string
}

export function normalizeFormTemplateName(name: string): string {
  return name.trim().toLowerCase()
}

function pickCopySource(forms: FormTemplateRow[]): FormTemplateRow | null {
  if (forms.length === 0) return null
  const active = forms.filter((f) => f.is_active)
  const pool = active.length > 0 ? active : forms
  return [...pool].sort((a, b) => a.id - b.id)[0] ?? null
}

export type TenantFormTemplateGap = {
  has: FormTemplateRow[]
  missing: Array<{
    templateName: string
    source: FormTemplateRow
    sourceTenantIds: number[]
  }>
}

/** Compare unique form template names across tenants vs what the target tenant already has. */
export function buildTenantFormTemplateGap(
  tenantId: number,
  allForms: FormTemplateRow[]
): TenantFormTemplateGap {
  const byName = new Map<string, FormTemplateRow[]>()
  for (const form of allForms) {
    const key = normalizeFormTemplateName(form.name)
    if (!key) continue
    const list = byName.get(key) ?? []
    list.push(form)
    byName.set(key, list)
  }

  const tenantKeys = new Set(
    allForms
      .filter((f) => f.tenant_id === tenantId)
      .map((f) => normalizeFormTemplateName(f.name))
      .filter(Boolean)
  )

  const has = allForms
    .filter((f) => f.tenant_id === tenantId)
    .sort((a, b) => a.name.localeCompare(b.name))

  const missing: TenantFormTemplateGap['missing'] = []
  for (const [, forms] of byName) {
    const key = normalizeFormTemplateName(forms[0]!.name)
    if (tenantKeys.has(key)) continue
    const source = pickCopySource(forms)
    if (!source) continue
    missing.push({
      templateName: source.name,
      source,
      sourceTenantIds: [...new Set(forms.map((f) => f.tenant_id))],
    })
  }

  missing.sort((a, b) => a.templateName.localeCompare(b.templateName))

  return { has, missing }
}
