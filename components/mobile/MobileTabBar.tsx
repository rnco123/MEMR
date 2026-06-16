'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export type MobileTabItem = {
  key: string
  label: string
  icon: React.ReactNode
  href?: string
  onClick?: () => void
  isActive?: (pathname: string) => boolean
}

type Theme = 'blue' | 'purple'

const themeStyles: Record<
  Theme,
  {
    shell: string
    activePill: string
    inactive: string
  }
> = {
  blue: {
    shell:
      'bg-[#E8F1FE]/95 border border-[#2E6EF3]/12 shadow-[0_10px_40px_-6px_rgba(46,110,243,0.35)] backdrop-blur-md supports-[backdrop-filter]:bg-[#E8F1FE]/90',
    activePill: 'bg-[#1a2744] text-white shadow-md',
    inactive: 'text-slate-600 hover:text-[#2E6EF3] active:bg-white/40',
  },
  purple: {
    shell:
      'bg-[#F3EDFF]/95 border border-purple-200/50 shadow-[0_10px_40px_-6px_rgba(124,58,237,0.28)] backdrop-blur-md supports-[backdrop-filter]:bg-[#F3EDFF]/90',
    activePill: 'bg-[#4c1d95] text-white shadow-md',
    inactive: 'text-purple-800/65 hover:text-purple-700 active:bg-white/40',
  },
}

/**
 * Floating pill-style bottom tab bar for mobile (phone) only.
 * Active tab shows icon + label in a dark pill; inactive tabs are icon-only.
 */
export function MobileTabBar({
  items,
  theme = 'blue',
}: {
  items: MobileTabItem[]
  theme?: Theme
}) {
  const pathname = usePathname()
  if (items.length === 0) return null

  const styles = themeStyles[theme]

  const isActive = (item: MobileTabItem) =>
    item.isActive ? item.isActive(pathname) : item.href ? pathname === item.href : false

  return (
    <div className="lg:hidden sticky bottom-0 z-40 shrink-0 pointer-events-none px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <nav
        className={`pointer-events-auto mx-auto flex w-full max-w-md items-center justify-between gap-0.5 rounded-[1.75rem] px-1.5 py-1.5 ${styles.shell}`}
        aria-label="Primary"
      >
        {items.map((item) => {
          const active = isActive(item)
          const className = active
            ? `flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-2.5 py-2 transition-all duration-200 ease-out ${styles.activePill}`
            : `flex shrink-0 items-center justify-center rounded-full p-2.5 transition-all duration-200 ease-out ${styles.inactive} active:scale-95`

          const inner = active ? (
            <>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center [&>svg]:h-5 [&>svg]:w-5">
                {item.icon}
              </span>
              <span className="truncate text-[11px] font-semibold leading-none">{item.label}</span>
            </>
          ) : (
            <span className="flex h-5 w-5 items-center justify-center [&>svg]:h-5 [&>svg]:w-5">
              {item.icon}
            </span>
          )

          return item.href ? (
            <Link
              key={item.key}
              href={item.href}
              className={className}
              aria-current={active ? 'page' : undefined}
              aria-label={active ? undefined : item.label}
              title={item.label}
            >
              {inner}
            </Link>
          ) : (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              className={className}
              aria-label={item.label}
              title={item.label}
            >
              {inner}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
