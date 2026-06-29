import { resolveI693TemplateGroup, resolveCivilSurgeonAddressForGroup } from '@/lib/i693/location-autofill'

describe('resolveI693TemplateGroup', () => {
  it('maps standard Clinica groups A/B/C', () => {
    expect(resolveI693TemplateGroup('A', {})).toBe('A')
    expect(resolveI693TemplateGroup('B', {})).toBe('B')
    expect(resolveI693TemplateGroup('C', {})).toBe('C')
  })

  it('maps Kempwood CLN-28 to Houston (B) template', () => {
    expect(resolveI693TemplateGroup('CLN-28', {})).toBe('B')
  })

  it('maps Kempwood tenant to Houston (B) template', () => {
    expect(resolveI693TemplateGroup('', { tenant_id: 3 })).toBe('B')
  })

  it('returns null for unknown groups', () => {
    expect(resolveI693TemplateGroup('CLN-99', { tenant_id: 1 })).toBeNull()
  })
})

describe('resolveCivilSurgeonAddressForGroup', () => {
  it('uses fixed Dallas address for Group A regardless of location', () => {
    const result = resolveCivilSurgeonAddressForGroup('A', {
      address: '2731 W Northwest Hwy, Dallas, TX 75220',
      email: 'other@clinic.com',
      phone: '8175550100',
    })
    expect(result).toEqual({
      street: '11411 E NW HIGHWAY',
      apt: '',
      city: 'DALLAS',
      state: 'TX',
      zip: '75218',
      phone: '4698868060',
      email: 'immdallassanmiguel@gmail.com',
    })
  })

  it('uses fixed Houston address for Group B regardless of location', () => {
    const result = resolveCivilSurgeonAddressForGroup('B', {
      address: '11243 Veterans Memorial Dr, Houston, TX 77067',
      email: 'other@clinic.com',
      phone: '7135550100',
    })
    expect(result).toEqual({
      street: '5712 FONDREN RD',
      apt: '',
      city: 'HOUSTON',
      state: 'TX',
      zip: '77036',
      phone: '4698868060',
      email: 'immdallassanmiguel@gmail.com',
    })
  })

  it('uses fixed Houston address for Kempwood (Group B template)', () => {
    const result = resolveCivilSurgeonAddressForGroup('B', {
      address: '9325 Kempwood Dr, Houston, TX 77080',
      email: 'kempwoodclinic@myclinicmd.com',
      phone: '7135559999',
    })
    expect(result.street).toBe('5712 FONDREN RD')
    expect(result.city).toBe('HOUSTON')
    expect(result.zip).toBe('77036')
  })

  it('uses fixed San Antonio address for Group C regardless of location', () => {
    const result = resolveCivilSurgeonAddressForGroup('C', {
      address: '680 SW Military Dr., Suite EF, San Antonio, TX 78221',
      email: 'other@clinic.com',
      phone: '2105550100',
    })
    expect(result).toEqual({
      street: '13032 NACOGDOCHES',
      apt: '213',
      city: 'SAN ANTONIO',
      state: 'TX',
      zip: '78217',
      phone: '4698868060',
      email: 'immdallassanmiguel@gmail.com',
    })
  })
})
