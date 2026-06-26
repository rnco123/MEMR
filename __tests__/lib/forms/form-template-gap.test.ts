import {
  buildTenantFormTemplateGap,
  normalizeFormTemplateName,
  type FormTemplateRow,
} from '@/lib/forms/form-template-gap'

const base = (tenantId: number, name: string, id = 1): FormTemplateRow => ({
  id,
  tenant_id: tenantId,
  name,
  is_active: true,
  html: '<p>x</p>',
})

describe('buildTenantFormTemplateGap', () => {
  it('lists forms tenant has and templates missing by name', () => {
    const all: FormTemplateRow[] = [
      base(1, 'AI consent Form', 1),
      base(1, 'Cash-Pay Policy', 2),
      base(3, 'AI consent Form', 3),
      base(3, 'HIPAA Notice', 4),
    ]

    const gap = buildTenantFormTemplateGap(3, all)

    expect(gap.has.map((f) => f.name).sort()).toEqual(['AI consent Form', 'HIPAA Notice'])
    expect(gap.missing).toHaveLength(1)
    expect(gap.missing[0]!.templateName).toBe('Cash-Pay Policy')
    expect(gap.missing[0]!.source.tenant_id).toBe(1)
  })

  it('matches template names case-insensitively', () => {
    const all: FormTemplateRow[] = [base(1, 'Consent Form', 1), base(2, 'consent form', 2)]
    const gap = buildTenantFormTemplateGap(2, all)
    expect(gap.has).toHaveLength(1)
    expect(gap.missing).toHaveLength(0)
  })
})

describe('normalizeFormTemplateName', () => {
  it('trims and lowercases', () => {
    expect(normalizeFormTemplateName('  Foo Bar  ')).toBe('foo bar')
  })
})
