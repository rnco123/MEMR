import { readFile } from 'fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { existsSync } from 'node:fs'
import type { I693FormData } from '@/lib/i693/types'
import { fillFlatI693PdfInProcess } from '@/lib/i693/fill-flat-in-process'

const USE_IN_PROCESS = process.env.I693_PDF_IN_PROCESS === '1'

function resolveTsxCli(): string | null {
  const candidates = [
    path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs'),
    path.join(process.cwd(), 'node_modules', '.bin', 'tsx'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return null
}

/** Run MuPDF fill in an isolated Node process (avoids Next.js webpack breaking WASM). */
async function fillFlatI693PdfViaSubprocess(
  templatePath: string,
  data: I693FormData
): Promise<{ bytes: Uint8Array; filled: string[] }> {
  const tsxCli = resolveTsxCli()
  if (!tsxCli) {
    throw new Error(
      'tsx is required for I-693 PDF export. Run: npm install tsx — or set I693_PDF_IN_PROCESS=1 if MuPDF works in-process.'
    )
  }

  const script = path.join(process.cwd(), 'lib', 'i693', 'run-fill-flat-subprocess.ts')

  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [tsxCli, script, templatePath], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    })

    const outChunks: Buffer[] = []
    let errText = ''

    proc.stdout.on('data', (chunk: Buffer) => outChunks.push(chunk))
    proc.stderr.on('data', (chunk: Buffer) => {
      errText += chunk.toString()
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(errText.trim() || `I-693 PDF subprocess exited with code ${code}`))
        return
      }
      let filled: string[] = []
      const lines = errText.trim().split('\n').filter(Boolean)
      const metaLine = lines[lines.length - 1]
      if (metaLine) {
        try {
          const meta = JSON.parse(metaLine) as { filled?: string[] }
          filled = meta.filled ?? []
        } catch {
          /* ignore parse errors */
        }
      }
      resolve({ bytes: new Uint8Array(Buffer.concat(outChunks)), filled })
    })

    proc.stdin.write(JSON.stringify({ formData: data }))
    proc.stdin.end()
  })
}

/**
 * Render flat USCIS I-693 (official template) with digital form values overlaid.
 * Uses a subprocess under Next.js so MuPDF WASM is not broken by webpack.
 */
export async function fillFlatI693Pdf(
  templatePath: string,
  data: I693FormData
): Promise<{ bytes: Uint8Array; filled: string[] }> {
  if (USE_IN_PROCESS) {
    return fillFlatI693PdfInProcess(templatePath, data)
  }
  try {
    return await fillFlatI693PdfViaSubprocess(templatePath, data)
  } catch (subErr) {
    try {
      return await fillFlatI693PdfInProcess(templatePath, data)
    } catch {
      throw subErr
    }
  }
}

/** True if PDF has no fillable AcroForm fields (flat scan/edition). */
export async function isFlatI693Template(templatePath: string): Promise<boolean> {
  try {
    const { PDFDocument } = await import('pdf-lib')
    const raw = await readFile(templatePath)
    const doc = await PDFDocument.load(new Uint8Array(raw), { ignoreEncryption: true })
    const form = doc.getForm()
    if (!form || typeof form.getFields !== 'function') return true
    return form.getFields().length === 0
  } catch {
    return true
  }
}
