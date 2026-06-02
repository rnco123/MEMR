/**
 * CLI: argv[2]=templatePath argv[3]=scale
 * stdout: JSON { pageCount, pageWidth, pageHeight, scale, pages: base64[] }
 */
import { renderTemplatePagesInProcess } from '@/lib/i693/render-template-pages-in-process'

async function main() {
  const templatePath = process.argv[2]
  const scale = Number(process.argv[3] ?? '1.25')
  if (!templatePath) {
    process.stderr.write('Usage: run-render-template-pages.ts <template.pdf> [scale]\n')
    process.exit(1)
  }

  const result = await renderTemplatePagesInProcess(
    templatePath,
    Number.isFinite(scale) ? scale : 1.25
  )

  const payload = {
    pageCount: result.pageCount,
    pageWidth: result.pageWidth,
    pageHeight: result.pageHeight,
    scale: result.scale,
    pages: result.pages.map((p) => Buffer.from(p).toString('base64')),
  }

  process.stdout.write(JSON.stringify(payload))
}

main().catch((e) => {
  process.stderr.write(e instanceof Error ? e.stack ?? e.message : String(e))
  process.stderr.write('\n')
  process.exit(1)
})
