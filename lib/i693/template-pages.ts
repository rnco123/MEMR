import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { resolveI693TemplatePath } from '@/lib/i693/generate-pdf'
import { renderTemplatePagesInProcess } from '@/lib/i693/render-template-pages-in-process'

export type TemplatePagesPayload = {
  pageCount: number
  pageWidth: number
  pageHeight: number
  scale: number
  /** data URLs for client */
  pages: string[]
}

const memoryCache = new Map<string, TemplatePagesPayload>()
const PREVIEW_SCALE = 1.25

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

function cacheKeyForTemplate(templatePath: string): string {
  const stat = existsSync(templatePath) ? templatePath : 'missing'
  return createHash('sha256').update(`${stat}:${PREVIEW_SCALE}:pages-v3`).digest('hex').slice(0, 16)
}

async function cacheDir(): Promise<string> {
  const dir = path.join(process.cwd(), '.cache', 'i693-template-pages')
  await mkdir(dir, { recursive: true })
  return dir
}

async function readDiskCache(key: string): Promise<TemplatePagesPayload | null> {
  try {
    const file = path.join(await cacheDir(), `${key}.json`)
    if (!existsSync(file)) return null
    const raw = await readFile(file, 'utf8')
    return JSON.parse(raw) as TemplatePagesPayload
  } catch {
    return null
  }
}

async function writeDiskCache(key: string, payload: TemplatePagesPayload): Promise<void> {
  const file = path.join(await cacheDir(), `${key}.json`)
  await writeFile(file, JSON.stringify(payload), 'utf8')
}

async function renderViaSubprocess(templatePath: string): Promise<TemplatePagesPayload> {
  const tsxCli = resolveTsxCli()
  if (!tsxCli) {
    return renderInProcess(templatePath)
  }

  const script = path.join(process.cwd(), 'lib', 'i693', 'run-render-template-pages.ts')

  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [tsxCli, script, templatePath, String(PREVIEW_SCALE)], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })

    const chunks: Buffer[] = []
    let err = ''
    proc.stdout.on('data', (c: Buffer) => chunks.push(c))
    proc.stderr.on('data', (c: Buffer) => {
      err += c.toString()
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(err.trim() || `template render exit ${code}`))
        return
      }
      try {
        const json = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
          pageCount: number
          pageWidth: number
          pageHeight: number
          scale: number
          pages: string[]
        }
        resolve({
          pageCount: json.pageCount,
          pageWidth: json.pageWidth,
          pageHeight: json.pageHeight,
          scale: json.scale,
          pages: json.pages.map((b) => `data:image/png;base64,${b}`),
        })
      } catch (e) {
        reject(e)
      }
    })
  })
}

async function renderInProcess(templatePath: string): Promise<TemplatePagesPayload> {
  const result = await renderTemplatePagesInProcess(templatePath, PREVIEW_SCALE)
  return {
    pageCount: result.pageCount,
    pageWidth: result.pageWidth,
    pageHeight: result.pageHeight,
    scale: result.scale,
    pages: result.pages.map((p) => `data:image/png;base64,${Buffer.from(p).toString('base64')}`),
  }
}

/** Cached blank I-693 template page images for the PDF form editor. */
export async function getI693TemplatePages(): Promise<TemplatePagesPayload | null> {
  const templatePath = await resolveI693TemplatePath()
  if (!templatePath) return null

  const key = cacheKeyForTemplate(templatePath)
  const mem = memoryCache.get(key)
  if (mem) return mem

  const disk = await readDiskCache(key)
  if (disk) {
    memoryCache.set(key, disk)
    return disk
  }

  let payload: TemplatePagesPayload
  try {
    payload = await renderViaSubprocess(templatePath)
  } catch {
    payload = await renderInProcess(templatePath)
  }

  memoryCache.set(key, payload)
  void writeDiskCache(key, payload)
  return payload
}
