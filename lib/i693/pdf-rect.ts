/** Convert PDF widget rects (MuPDF: origin bottom-left) to CSS overlay on a page image. */

export const PDF_PAGE_WIDTH = 612
export const PDF_PAGE_HEIGHT = 792

export type CssBox = {
  left: number
  top: number
  width: number
  height: number
}

/** MuPDF `getRect()` → [x0, y0, x1, y1] with y measured from page bottom. */
export function mupdfRectToCssBox(rect: number[]): CssBox {
  const x0 = rect[0] ?? 0
  const y0 = rect[1] ?? 0
  const x1 = rect[2] ?? x0
  const y1 = rect[3] ?? y0
  const width = x1 - x0
  const height = y1 - y0
  return {
    left: x0,
    top: PDF_PAGE_HEIGHT - y1,
    width,
    height,
  }
}

/** pdf.js `getAnnotations()` widget rects are already top-left origin. */
export function pdfjsRectToCssBox(rect: number[]): CssBox {
  const x0 = rect[0] ?? 0
  const y0 = rect[1] ?? 0
  const x1 = rect[2] ?? x0
  const y1 = rect[3] ?? y0
  return {
    left: x0,
    top: y0,
    width: x1 - x0,
    height: y1 - y0,
  }
}

export function cssBoxToPercent(box: CssBox, pageW = PDF_PAGE_WIDTH, pageH = PDF_PAGE_HEIGHT) {
  return {
    left: `${(box.left / pageW) * 100}%`,
    top: `${(box.top / pageH) * 100}%`,
    width: `${(box.width / pageW) * 100}%`,
    height: `${(box.height / pageH) * 100}%`,
  }
}
