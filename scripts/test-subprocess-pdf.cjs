const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const tsx = path.join(root, 'node_modules/tsx/dist/cli.mjs')
const script = path.join(root, 'lib/i693/run-fill-flat-subprocess.ts')
const template = path.join(root, 'public/forms/i-693-template.pdf')
const out = path.join(root, 'public/forms/i-693-subprocess-test.pdf')

const formData = {
  applicant: {
    family_name: 'Rivera',
    given_name: 'Ana',
    middle_name: '',
    in_care_of: '',
    street: '100 Demo Street',
    apt: '',
    city: 'Houston',
    state: 'TX',
    zip: '77001',
    province: '',
    postal_code: '',
    country: 'United States',
    date_of_birth: '1990-06-15',
    city_of_birth: '',
    state_of_birth: '',
    country_of_birth: 'Mexico',
    country_of_citizenship: 'Mexico',
    a_number: 'A123456789',
    uscis_online_account: '',
    passport_number: '',
    sex: 'female',
    eligibility_category: 'Adjustment of status',
  },
  vaccinations: [{ vaccine_name: 'MMR', date_given: '2010-05-01', waiver_reason: '', not_medically_appropriate: false }],
}

const proc = spawn(process.execPath, [tsx, script, template], {
  cwd: root,
  stdio: ['pipe', 'pipe', 'pipe'],
})

const chunks = []
let err = ''
proc.stdout.on('data', (c) => chunks.push(c))
proc.stderr.on('data', (c) => {
  err += c.toString()
})
proc.on('close', (code) => {
  if (code !== 0) {
    console.error('Failed:', err)
    process.exit(1)
  }
  fs.writeFileSync(out, Buffer.concat(chunks))
  console.log('Wrote', out, Buffer.concat(chunks).length, 'bytes')
  console.log('Meta:', err.trim())
})

proc.stdin.write(JSON.stringify({ formData }))
proc.stdin.end()
