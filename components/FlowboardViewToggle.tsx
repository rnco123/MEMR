'use client'

export type FlowboardDisplayMode = 'list' | 'kanban'

type FlowboardViewToggleProps = {
  value: FlowboardDisplayMode
  onChange: (mode: FlowboardDisplayMode) => void
  listLabel?: string
  kanbanLabel?: string
  accentTheme?: 'blue' | 'purple'
}

export function FlowboardViewToggle({
  value,
  onChange,
  listLabel = 'List',
  kanbanLabel = 'Board',
  accentTheme = 'blue',
}: FlowboardViewToggleProps) {
  const active =
    accentTheme === 'purple'
      ? 'bg-purple-600 text-white shadow-sm'
      : 'bg-[#2E6EF3] text-white shadow-sm'

  return (
    <div
      className="inline-flex h-11 p-1 rounded-xl bg-slate-100 border border-slate-200"
      role="tablist"
      aria-label="Flowboard display mode"
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === 'list'}
        onClick={() => onChange('list')}
        className={`inline-flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium transition-all ${
          value === 'list' ? active : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        {listLabel}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === 'kanban'}
        onClick={() => onChange('kanban')}
        className={`inline-flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium transition-all ${
          value === 'kanban' ? active : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7"
          />
        </svg>
        {kanbanLabel}
      </button>
    </div>
  )
}

export const FLOWBOARD_VIEW_STORAGE_KEY = 'memr.flowboard.displayMode'

export function readFlowboardDisplayMode(): FlowboardDisplayMode {
  if (typeof window === 'undefined') return 'list'
  try {
    const v = localStorage.getItem(FLOWBOARD_VIEW_STORAGE_KEY)
    return v === 'kanban' ? 'kanban' : 'list'
  } catch {
    return 'list'
  }
}

export function writeFlowboardDisplayMode(mode: FlowboardDisplayMode) {
  try {
    localStorage.setItem(FLOWBOARD_VIEW_STORAGE_KEY, mode)
  } catch {
    /* ignore */
  }
}
