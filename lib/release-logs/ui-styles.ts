/**
 * Locked Release Logs UI tokens.
 * Preserve these values unless intentionally redesigning the changelog screen.
 */
export const RELEASE_LOGS_UI = {
  layout: {
    page: 'mx-auto flex w-full flex-col space-y-6',
    viewerWidth: 'max-w-4xl',
    managerWidth: 'max-w-7xl',
    groupStackViewer: 'space-y-4',
    groupStackManager: 'space-y-5',
    cardGrid: 'grid grid-cols-1 gap-2',
    cardGridManager: 'xl:grid-cols-2',
  },
  panel: {
    shell: 'flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm',
    viewerMaxHeight: 'max-h-[calc(100dvh-12rem)]',
    managerMaxHeight: 'max-h-[calc(100dvh-18rem)]',
    header:
      'shrink-0 flex flex-wrap items-center gap-3 border-b border-slate-100 bg-white/95 px-5 py-3.5 backdrop-blur-sm',
    scrollBody:
      'min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 scrollbar-thin',
    scrollBodyViewer: 'bg-gradient-to-b from-slate-50/40 to-white',
  },
  tabs: {
    list: 'inline-flex h-11 rounded-xl border border-slate-200 bg-slate-50 p-1',
    listViewer: 'w-full sm:w-auto',
    active: 'bg-purple-600 text-white shadow-sm',
    idle: 'text-slate-600 hover:bg-white/80 hover:text-slate-900',
    button: 'flex-1 rounded-lg px-4 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 sm:flex-none',
    countActive: 'text-purple-200',
    countIdle: 'text-slate-400',
  },
  dateHeader: {
    row: 'mb-2 flex items-center gap-3',
    label: 'shrink-0 font-semibold leading-tight text-slate-700',
    labelViewer: 'text-sm',
    labelManager: 'text-xs',
    weekdayViewer: '',
    weekdayManager: 'uppercase tracking-wider',
    date: 'font-normal text-slate-500',
    separator: 'h-px flex-1 bg-gradient-to-r from-slate-200 to-transparent',
  },
  card: {
    accent: 'border-l-2 border-l-purple-300',
    padding: 'p-4',
    viewer:
      'rounded-xl border border-slate-100 bg-slate-50/50 transition-colors hover:border-slate-200/80 hover:bg-slate-50/80',
    manager:
      'rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:border-slate-200 hover:shadow-md',
  },
  title: {
    base: 'font-semibold text-purple-800',
    viewer: 'text-base',
    manager: 'text-sm',
  },
  description:
    'mt-2 list-disc space-y-0.5 pl-5 text-[13px] font-normal leading-snug text-slate-500 marker:text-purple-300',
  descriptionItem: 'pl-0.5',
  badge: {
    upcoming: 'shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200/80',
    released:
      'shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 ring-1 ring-emerald-200/80',
  },
  pageTitle: {
    viewer: 'text-2xl font-bold text-purple-900',
    manager: 'text-2xl font-bold text-slate-900',
  },
  subtitle: 'mt-1 max-w-2xl text-sm text-slate-500',
} as const

export function releaseLogCardClass(viewerMode: boolean): string {
  const variant = viewerMode ? RELEASE_LOGS_UI.card.viewer : RELEASE_LOGS_UI.card.manager
  return `${RELEASE_LOGS_UI.card.accent} ${RELEASE_LOGS_UI.card.padding} ${variant}`
}

export function releaseLogTitleClass(viewerMode: boolean): string {
  const size = viewerMode ? RELEASE_LOGS_UI.title.viewer : RELEASE_LOGS_UI.title.manager
  return `${RELEASE_LOGS_UI.title.base} ${size}`
}
