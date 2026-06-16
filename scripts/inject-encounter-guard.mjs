/**
 * One-shot codemod: inject guardEncounterAccess into encounter API routes.
 */
import fs from 'fs'
import path from 'path'
import { globSync } from 'glob'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const files = globSync('app/api/encounters/**/route.ts', { cwd: root, absolute: true })

const importLine = "import { guardEncounterAccess } from '@/lib/encounters/guard'\n"

for (const file of files) {
  let c = fs.readFileSync(file, 'utf8')
  if (c.includes('guardEncounterAccess') || c.includes('assertEncounterAccess')) {
    continue
  }

  if (!c.includes("from '@/lib/encounters/guard'")) {
    const dynamicIdx = c.indexOf('export const dynamic')
    if (dynamicIdx === -1) continue
    c = c.slice(0, dynamicIdx) + importLine + c.slice(dynamicIdx)
  }

  const adminMatch = c.match(/(\n\s*)const admin = createAdminClient\(\)/)
  if (!adminMatch) continue

  const beforeAdmin = c.slice(0, adminMatch.index)
  if (!beforeAdmin.includes('encounterId') || !beforeAdmin.includes('user')) continue

  c =
    c.slice(0, adminMatch.index) +
    `${adminMatch[1]}await guardEncounterAccess(user.id, encounterId)\n${adminMatch[1]}const admin = createAdminClient()` +
    c.slice(adminMatch.index + adminMatch[0].length)

  fs.writeFileSync(file, c)
  console.log('updated', path.relative(root, file))
}
