'use client'

import type { ReactNode } from 'react'

/** Shared native select styles for flowboard filter bars. */
export const FLOWBOARD_SELECT_CLASS =
  'h-11 w-full min-w-0 sm:w-auto sm:min-w-[6.5rem] sm:max-w-[11rem] px-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3] cursor-pointer'

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
    <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <div className="min-w-0 flex-1">{search}</div>
        {searchActions}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">{filters}</div>
      {afterFilters}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-slate-100 pt-3">
        {footer}
      </div>
    </div>
  )
}

export function FlowboardFilterField({
  label,
  children,
  wide = false,
}: {
  label: string
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div
      className={
        wide
          ? 'flex w-full min-w-0 basis-full items-center gap-2 sm:max-w-[20rem] sm:basis-auto'
          : 'flex w-full min-w-0 items-center gap-2 sm:w-auto sm:max-w-[14rem]'
      }
    >
      <span className="shrink-0 text-xs font-medium text-slate-500 whitespace-nowrap">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/** Pushes list/kanban toggle to the end; wraps to its own row on narrow widths. */
export function FlowboardViewToggleSlot({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full shrink-0 basis-full justify-end sm:ml-auto sm:w-auto sm:basis-auto">
      {children}
    </div>
  )
}
