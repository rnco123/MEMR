import fs from 'fs'

const content = fs.readFileSync('lib/i18n/dictionaries.ts', 'utf8')
const enBlock = content.slice(content.indexOf('const en:'), content.indexOf('const es:'))
const esBlock = content.slice(content.indexOf('const es:'), content.indexOf('export const dictionaries'))

function keys(block) {
  return new Set([...block.matchAll(/'([^']+)':/g)].map((m) => m[1]))
}

const en = keys(enBlock)
const es = keys(esBlock)
const missingInEs = [...en].filter((k) => !es.has(k)).sort()
const missingInEn = [...es].filter((k) => !en.has(k)).sort()

console.log(`EN: ${en.size}  ES: ${es.size}`)
console.log(`Missing in ES (${missingInEs.length}):`)
console.log(missingInEs.join('\n'))
if (missingInEn.length) {
  console.log(`\nMissing in EN (${missingInEn.length}):`)
  console.log(missingInEn.join('\n'))
}
