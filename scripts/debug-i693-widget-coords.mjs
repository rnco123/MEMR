import { writeFile } from 'node:fs/promises'
import { extractPdfWidgetEditorFields } from '../lib/i693/extract-pdf-widgets.ts'
import { renderTemplatePageInProcess } from '../lib/i693/render-template-pages-in-process.ts'

const template = 'public/forms/i-693-template.pdf'
const scale = 1.25
const pageW = 612
const pageH = 792

const png = await renderTemplatePageInProcess(template, 0, scale)
const fields = (await extractPdfWidgetEditorFields(template)).filter((f) => f.page === 0)

/** Current (bottom-origin) vs top-origin CSS top */
function cssTopBottomOrigin(y1, h) {
  return pageH - y1 - h
}
function cssTopTopOrigin(y0) {
  return y0
}

const boxes = fields.map((f) => {
  const h = f.height ?? 14
  const y0 = pageH - f.y - h // infer y0 if y stored as bottom-origin top
  return {
    key: f.key,
    widget: f.widgetName?.split('.').pop(),
    x: f.x,
    yBottomOrigin: f.y,
    cssBottom: cssTopBottomOrigin(f.y, h),
    cssTop: cssTopTopOrigin(pageH - f.y - h),
    cssRawY0: pageH - f.y - h,
    w: f.width,
    h,
  }
})

let html = `<!DOCTYPE html><html><body style="margin:0">
<div style="position:relative;width:${pageW * scale}px;height:${pageH * scale}px">
<img src="data:image/png;base64,${Buffer.from(png).toString('base64')}" width="${pageW * scale}" height="${pageH * scale}" style="position:absolute;left:0;top:0"/>
`

for (const b of boxes) {
  const topA = b.cssBottom * scale
  const topB = (pageH - b.yBottomOrigin - b.h) * scale
  const topC = b.cssRawY0 * scale
  html += `<div title="${b.key}" style="position:absolute;left:${b.x * scale}px;top:${topA}px;width:${b.w * scale}px;height:${b.h * scale}px;border:2px solid red;box-sizing:border-box;font-size:8px;overflow:hidden">${b.key.split('.').pop()}</div>`
}

html += `</div><p>Red = current bottom-origin formula. Open image and verify alignment.</p></body></html>`
await writeFile('public/forms/i-693-debug-align-bottom.html', html)

// top-origin version
html = html.replace(/border:2px solid red/g, 'border:2px solid lime')
for (const b of boxes) {
  const y0 = pageH - b.yBottomOrigin - b.h
  const topT = y0 * scale
  // rebuild - simpler second file
}
const htmlTop = `<!DOCTYPE html><html><body style="margin:0">
<div style="position:relative;width:${pageW * scale}px;height:${pageH * scale}px">
<img src="data:image/png;base64,${Buffer.from(png).toString('base64')}" width="${pageW * scale}" height="${pageH * scale}" style="position:absolute;left:0;top:0"/>
${fields
  .map((f) => {
    const h = f.height ?? 14
    const y0 = pageH - f.y - h
    const topT = y0 * scale
    return `<div title="${f.key}" style="position:absolute;left:${f.x * scale}px;top:${topT}px;width:${f.width * scale}px;height:${h * scale}px;border:2px solid lime;box-sizing:border-box;font-size:8px">${f.key.split('.').pop()}</div>`
  })
  .join('')}
</div><p>Green = treating y as bottom-origin top then converting y0=792-y-h</p></body></html>`
await writeFile('public/forms/i-693-debug-align-top.html', htmlTop)

// Raw rect from mupdf without our y=y1 conversion
const mupdf = await import('mupdf')
const doc = mupdf.Document.openDocument(template)
const page = doc.loadPage(0)
const raw = []
for (const w of page.getWidgets()) {
  const n = w.getName().split('.').pop() || ''
  if (n.includes('BarCode') || n.includes('FamilyName') || n.includes('CityOrTown')) {
    const r = w.getRect()
    raw.push({ n, r, topFromTop: r[1], topFromBottom: pageH - r[3] })
  }
}
console.log(JSON.stringify(raw, null, 2))
console.log('Wrote public/forms/i-693-debug-align-bottom.html and -top.html')
