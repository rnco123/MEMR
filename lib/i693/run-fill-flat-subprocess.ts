/**
 * CLI: stdin JSON { formData }, argv[2] = template path.
 * stdout = PDF bytes, stderr last line = JSON { filled: string[] }
 */
import { readFileSync } from 'node:fs'
import type { I693FormData } from '@/lib/i693/types'
import { mergeI693Form } from '@/lib/i693/types'
import { fillFlatI693PdfInProcess } from '@/lib/i693/fill-flat-in-process'

async function main() {
  const templatePath = process.argv[2]
  if (!templatePath) {
    process.stderr.write('Usage: run-fill-flat-subprocess.ts <template.pdf>\n')
    process.exit(1)
  }

  const json = readFileSync(0, 'utf8')
  const body = JSON.parse(json) as { formData?: Partial<I693FormData> }
  const formData = mergeI693Form(body.formData)

  const { bytes, filled } = await fillFlatI693PdfInProcess(templatePath, formData)
  process.stdout.write(Buffer.from(bytes))
  process.stderr.write(JSON.stringify({ filled }) + '\n')
}

main().catch((e) => {
  process.stderr.write(e instanceof Error ? e.stack ?? e.message : String(e))
  process.stderr.write('\n')
  process.exit(1)
})
