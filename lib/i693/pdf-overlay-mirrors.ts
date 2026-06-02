import type { PdfCharCellPlacement, PdfTextPlacement } from '@/lib/i693/pdf-overlay-uscis-012025'

/** Pages 2–13 repeat applicant name + A-number in the top band (PDF page index 1–13). */
const MIRROR_PAGES_STANDARD: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

const HEADER_STD = {
  y: 745,
  family: { x: 60, width: 130 },
  given: { x: 197, width: 128 },
  middle: { x: 332, width: 118 },
  aNumber: { x: 472, cellWidth: 12.4, count: 9 },
}

const HEADER_PAGE_13 = {
  y: 647,
  family: { x: 54, width: 210 },
  given: { x: 270, width: 168 },
  middle: { x: 444, width: 120 },
  aNumber: { x: 390, cellWidth: 12.6, count: 9 },
}

function headerPlacements(page: number, layout: typeof HEADER_STD): PdfTextPlacement[] {
  return [
    {
      key: 'applicant.family_name',
      page,
      x: layout.family.x,
      y: layout.y,
      size: 9,
      width: layout.family.width,
    },
    {
      key: 'applicant.given_name',
      page,
      x: layout.given.x,
      y: layout.y,
      size: 9,
      width: layout.given.width,
    },
    {
      key: 'applicant.middle_name',
      page,
      x: layout.middle.x,
      y: layout.y,
      size: 9,
      width: layout.middle.width,
    },
  ]
}

function headerCharCells(page: number, layout: typeof HEADER_STD): PdfCharCellPlacement[] {
  return [
    {
      key: 'applicant.a_number',
      page,
      x: layout.aNumber.x,
      y: layout.y,
      count: layout.aNumber.count,
      cellWidth: layout.aNumber.cellWidth,
      mode: 'digit',
    },
  ]
}

/** Same applicant fields on every continuation page — edit once, updates everywhere. */
export function buildApplicantHeaderMirrors(): {
  text: PdfTextPlacement[]
  charCells: PdfCharCellPlacement[]
} {
  const text: PdfTextPlacement[] = []
  const charCells: PdfCharCellPlacement[] = []

  for (const page of MIRROR_PAGES_STANDARD) {
    text.push(...headerPlacements(page, HEADER_STD))
    charCells.push(...headerCharCells(page, HEADER_STD))
  }

  text.push(...headerPlacements(13, HEADER_PAGE_13))
  charCells.push(...headerCharCells(13, HEADER_PAGE_13))

  return { text, charCells }
}
