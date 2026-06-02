'use client'

import { useCallback, useRef } from 'react'
import { PDF_FIELD_BOX_HEIGHT, pdfPointToCssTop } from '@/lib/i693/pdf-editor-layout'
import {
  aNumberToCells,
  cellsToANumber,
  cellsToValue,
  valueToCells,
} from '@/lib/i693/pdf-char-cells'
type CharCellPlacement = {
  key: string
  page: number
  x: number
  y: number
  count: number
  cellWidth: number
  height?: number
  mode?: 'digit' | 'alnum'
  label: string
}

type Props = {
  placement: CharCellPlacement
  value: string
  editScale: number
  onChange: (value: string) => void
}

export function I693PdfCharCellField({ placement, value, editScale, onChange }: Props) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const mode = placement.mode ?? 'alnum'
  const isANumber = placement.key === 'applicant.a_number'

  const cells = isANumber
    ? aNumberToCells(value)
    : valueToCells(value, placement.count, mode)

  const commit = useCallback(
    (nextCells: string[]) => {
      onChange(
        isANumber ? cellsToANumber(nextCells) : cellsToValue(nextCells, mode)
      )
    },
    [isANumber, mode, onChange]
  )

  const handleCell = (index: number, char: string) => {
    const next = [...cells]
    next[index] = char.slice(-1)
    commit(next)
    if (char && index < placement.count - 1) {
      refs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !cells[index] && index > 0) {
      refs.current[index - 1]?.focus()
    }
    if (e.key === 'ArrowRight' && index < placement.count - 1) {
      refs.current[index + 1]?.focus()
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      refs.current[index - 1]?.focus()
    }
  }

  const boxHeightPt = placement.height ?? PDF_FIELD_BOX_HEIGHT
  const h = boxHeightPt * editScale
  const w = placement.cellWidth * editScale
  const fontSize = 9 * editScale

  return (
    <div
      className="absolute z-20 flex pointer-events-auto"
      style={{
        left: placement.x * editScale,
        top: pdfPointToCssTop(placement.y, boxHeightPt) * editScale,
        height: h,
      }}
      title={placement.label}
    >
      {cells.map((c, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          type="text"
          inputMode={mode === 'digit' ? 'numeric' : 'text'}
          maxLength={1}
          value={c}
          onChange={(e) => handleCell(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          className="bg-transparent border-0 text-center text-slate-900 font-[Times_New_Roman,Times,serif] uppercase tracking-wide p-0 m-0 shadow-none outline-none ring-0 hover:bg-white/70 focus:bg-white/95 focus:ring-1 focus:ring-[#2E6EF3]/60"
          style={{
            width: w,
            height: h,
            fontSize,
            lineHeight: `${h}px`,
          }}
          aria-label={`${placement.label} ${i + 1}`}
        />
      ))}
    </div>
  )
}
