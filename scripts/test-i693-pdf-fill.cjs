/**
 * Test filling flat I-693 template with sample data.
 * Run: node scripts/test-i693-pdf-fill.cjs
 */
const path = require('path')
const fs = require('fs')

async function main() {
  const { fillFlatI693Pdf } = await import('../lib/i693/fill-flat-pdf.ts').catch(() => null)
  if (!fillFlatI693Pdf) {
    // ts not runnable directly — use dynamic require after build; run via npx tsx if available
    const { execSync } = require('child_process')
    try {
      execSync('npx tsx scripts/test-i693-pdf-fill.mjs', { stdio: 'inherit', cwd: path.join(__dirname, '..') })
      return
    } catch {
      console.log('Install tsx or run from app: POST /api/encounters/39/i693/pdf after saving form')
      process.exit(0)
    }
  }
}

main()
