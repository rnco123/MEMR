'use client'

import type { ReactNode } from 'react'

/** Shared native select styles for flowboard filter bars. */
export const FLOWBOARD_SELECT_CLASS =
  'h-9 w-full min-w-0 max-w-full px-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3] cursor-pointer'

type FlowboardFilterToolbarProps = {
  search: ReactNode
  searchActions?: ReactNode
  filters: ReactNode
  afterFilters?: ReactNode
  footer: ReactNode
}

export function FlowboardFilterToolbar({
  search,
  searchActions,
  filters,
  afterFilters,
  footer,
}: FlowboardFilterToolbarProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-3 mb-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">{search}</div>
        {searchActions}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2.5">
        {filters}
        {afterFilters}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-slate-100 pt-2">
        {footer}
      </div>
    </div>
  )
}

export function FlowboardFilterField({
  label,
  children,
  wide = false,
  dob = false,
}: {
  label: string
  children: ReactNode
  wide?: boolean
  /** Wider field for year/month/day DOB selects */
  dob?: boolean
}) {
  return (
    <div
      className={
        dob
          ? 'flex w-full min-w-0 max-w-full shrink-0 basis-full items-center gap-2 overflow-hidden lg:basis-auto lg:w-auto'
          : wide
            ? 'flex w-full min-w-0 max-w-full shrink-0 basis-full items-center gap-2 overflow-hidden sm:basis-auto sm:w-[min(100%,14rem)]'
            : 'flex w-full min-w-0 max-w-full shrink-0 basis-[calc(50%-0.375rem)] items-center gap-2 overflow-hidden sm:basis-auto sm:w-auto sm:max-w-[11rem]'
      }
    >
      <span className="shrink-0 text-[11px] font-medium text-slate-500 whitespace-nowrap">{label}</span>
      <div className="min-w-0 max-w-full overflow-hidden">{children}</div>
    </div>
  )
}

/** Pushes list/kanban toggle to the end; wraps to its own row on narrow widths. */
export function FlowboardViewToggleSlot({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full shrink-0 basis-full justify-end lg:ml-auto lg:w-auto lg:basis-auto">
      {children}
    </div>
  )
}
