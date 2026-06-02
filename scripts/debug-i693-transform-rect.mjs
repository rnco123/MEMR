import { writeFile } from 'node:fs/promises'
import { renderTemplatePageInProcess } from '../lib/i693/render-template-pages-in-process.ts'

const mupdf = await import('mupdf')
const { Rect, Matrix } = mupdf
const template = 'public/forms/i-693-template.pdf'
const pageH = 792
const scale = 1.25

const doc = mupdf.Document.openDocument(template)
const page = doc.loadPage(0)
const tm = page.getTransform()
const png = await renderTemplatePageInProcess(template, 0, scale)

function cssFromRect(r, mode) {
  const [x0, y0, x1, y1] = r
  const w = x1 - x0
  const h = y1 - y0
  if (mode === 'raw-top') return { left: x0, top: y0, w, h }
  if (mode === 'bottom') return { left: x0, top: pageH - y1, w, h }
  if (mode === 'xf') {
    const tr = Rect.transform(r, tm)
    const [a, b, c, d] = [tr[0], tr[1], tr[2], tr[3]]
    const w2 = tr[2] - tr[0]
    const h2 = tr[3] - tr[1]
    return { left: tr[0], top: tr[1], w: w2, h: h2 }
  }
  return null
}

const targets = ['FamilyName', 'CityOrTown', 'BarCode', 'AlienNumber', 'ZipCode']
const modes = ['raw-top', 'bottom', 'xf']
let html = `<!DOCTYPE html><html><body>`

for (const mode of modes) {
  html += `<h2>${mode}</h2><div style="position:relative;width:${612 * scale}px;height:${792 * scale}px;margin-bottom:2rem">
<img src="data:image/png;base64,${Buffer.from(png).toString('base64')}" width="${612 * scale}" height="${792 * scale}" style="position:absolute;left:0;top:0"/>`
  for (const w of page.getWidgets()) {
    const n = w.getName().split('.').pop() || ''
    if (!targets.some((t) => n.includes(t))) continue
    const r = w.getRect()
    const c = cssFromRect(r, mode)
    if (!c) continue
    html += `<div style="position:absolute;left:${c.left * scale}px;top:${c.top * scale}px;width:${c.w * scale}px;height:${c.h * scale}px;border:2px solid ${mode === 'xf' ? 'lime' : mode === 'bottom' ? 'red' : 'blue'};box-sizing:border-box;font-size:7px">${n.slice(0, 12)}</div>`
  }
  html += `</div>`
}

html += '</body></html>'
await writeFile('public/forms/i-693-debug-transform.html', html)
console.log('transform', tm)
console.log('wrote i-693-debug-transform.html')
