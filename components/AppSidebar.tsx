'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { BrandMark } from '@/components/BrandMark'
import { UserAvatar } from '@/components/UserAvatar'

export type SidebarNavItem = {
  name: string
  href: string
  icon: React.ReactNode
  onClick?: () => void
  isActive?: (pathname: string) => boolean
  /** Show a small yellow attention dot on this item (e.g. pending items to review). */
  badgeDot?: boolean
}

export type SidebarNavSection = {
  title?: string
  items: SidebarNavItem[]
  defaultOpen?: boolean
}

type SidebarTheme = 'blue' | 'purple'

const themeStyles: Record<
  SidebarTheme,
  {
    shell: string
    sectionLabel: string
    itemActive: string
    itemIdle: string
    iconActive: string
    iconIdle: string
    railBtn: string
    activeDot: string
  }
> = {
  blue: {
    shell: 'bg-white/95 border-slate-200/80 shadow-[0_8px_30px_rgba(15,23,42,0.08)]',
    sectionLabel: 'text-slate-400',
    itemActive: 'bg-slate-100 text-slate-900 shadow-sm',
    itemIdle: 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
    iconActive: 'text-[#2E6EF3]',
    iconIdle: 'text-slate-400 group-hover:text-slate-600',
    railBtn:
      'border-slate-200 bg-white text-slate-600 shadow-[0_2px_8px_rgba(15,23,42,0.12)] hover:bg-slate-50 hover:text-[#2E6EF3] hover:border-[#2E6EF3]/30',
    activeDot: 'bg-[#2E6EF3]',
  },
  purple: {
    shell: 'bg-white/95 border-purple-100/90 shadow-[0_8px_30px_rgba(88,28,135,0.1)]',
    sectionLabel: 'text-purple-400/90',
    itemActive: 'bg-purple-50 text-purple-900 shadow-sm',
    itemIdle: 'text-slate-600 hover:bg-purple-50/80 hover:text-slate-900',
    iconActive: 'text-purple-600',
    iconIdle: 'text-slate-400 group-hover:text-purple-500',
    railBtn:
      'border-purple-200 bg-white text-purple-600 shadow-[0_2px_8px_rgba(88,28,135,0.15)] hover:bg-purple-50 hover:border-purple-300',
    activeDot: 'bg-purple-600',
  },
}

function NavTooltip({ label, show }: { label: string; show: boolean }) {
  if (!show) return null
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg"
    >
      {label}
      <span className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent border-r-slate-900" />
    </span>
  )
}

type NavRowProps = {
  item: SidebarNavItem
  isActive: boolean
  collapsed: boolean
  theme: SidebarTheme
  onNavigate?: () => void
}

const NAV_BADGE_DOT_CLASS =
  'h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400 nav-badge-blink'
const NAV_BADGE_DOT_COLLAPSED_CLASS =
  'absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-white nav-badge-blink'

function NavRow({ item, isActive, collapsed, theme, onNavigate }: NavRowProps) {
  const [hovered, setHovered] = useState(false)
  const styles = themeStyles[theme]
  const rowClass = `group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
    isActive ? styles.itemActive : styles.itemIdle
  } ${collapsed ? 'justify-center px-2.5' : ''}`

  const iconWrap = (
    <span
      className={`relative flex shrink-0 items-center justify-center ${
        isActive ? styles.iconActive : styles.iconIdle
      }`}
    >
      {item.icon}
      {collapsed && item.badgeDot && (
        <span className={NAV_BADGE_DOT_COLLAPSED_CLASS} aria-hidden />
      )}
      {collapsed && isActive && !item.badgeDot && (
        <span
          className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-white ${styles.activeDot}`}
          aria-hidden
        />
      )}
    </span>
  )

  const label = !collapsed ? (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <span className="truncate">{item.name}</span>
      {item.badgeDot && <span className={NAV_BADGE_DOT_CLASS} aria-hidden />}
    </span>
  ) : null

  const content = (
    <>
      {iconWrap}
      {label}
      <NavTooltip label={item.name} show={collapsed && hovered} />
    </>
  )

  const hoverHandlers = {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  }

  if (item.onClick) {
    return (
      <button
        type="button"
        onClick={() => {
          item.onClick?.()
          onNavigate?.()
        }}
        className={rowClass}
        title={collapsed ? item.name : undefined}
        {...hoverHandlers}
      >
        {content}
      </button>
    )
  }

  return (
    <Link
      href={item.href}
      className={rowClass}
      title={collapsed ? item.name : undefined}
      onClick={onNavigate}
      {...hoverHandlers}
    >
      {content}
    </Link>
  )
}

function RailCollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M15 19l-7-7 7-7" />
    </svg>
  )
}

/** Mobile header control — pair with AppSidebar `mobileOpen` / `onMobileClose`. */
export function SidebarMenuButton({
  onClick,
  className = '',
  label = 'Open menu',
}: {
  onClick: () => void
  className?: string
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50 ${className}`}
      aria-label={label}
    >
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  )
}

type AppSidebarProps = {
  sections: SidebarNavSection[]
  pathname: string
  theme?: SidebarTheme
  storageKey: string
  user?: {
    name: string
    subtitle?: string
    avatarId?: string | null
    avatarUrl?: string | null
    profileHref?: string
  }
  footer?: React.ReactNode
  /** Items pinned to the bottom of the nav — visible even when sidebar is collapsed (icon + tooltip). */
  bottomItems?: SidebarNavItem[]
  homeHref?: string
  collapseLabel?: string
  expandLabel?: string
  closeLabel?: string
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function AppSidebar({
  sections,
  pathname,
  theme = 'blue',
  storageKey,
  user,
  footer,
  bottomItems,
  homeHref,
  collapseLabel = 'Collapse',
  expandLabel = 'Expand',
  closeLabel = 'Close menu',
  mobileOpen = false,
  onMobileClose,
}: AppSidebarProps) {
  const styles = themeStyles[theme]
  const [collapsed, setCollapsed] = useState(false)
  const [sectionOpen, setSectionOpen] = useState<Record<number, boolean>>({})
  const [mounted, setMounted] = useState(false)

  const isMobileDrawer = mobileOpen

  useEffect(() => {
    setMounted(true)
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored === '1') setCollapsed(true)
    } catch {
      /* ignore */
    }
  }, [storageKey])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const apply = () => {
      if (mq.matches) setCollapsed(true)
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMobileClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileOpen, onMobileClose])

  const isSectionOpen = (index: number) => sectionOpen[index] !== false

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(storageKey, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [storageKey])

  const toggleSection = (index: number) => {
    if (collapsed && !isMobileDrawer) return
    setSectionOpen((prev) => ({ ...prev, [index]: !prev[index] }))
  }

  const resolveActive = (item: SidebarNavItem) =>
    item.isActive ? item.isActive(pathname) : pathname === item.href

  const showLabels = !collapsed || isMobileDrawer
  const effectiveCollapsed = collapsed && !isMobileDrawer

  const handleNavClick = () => {
    onMobileClose?.()
  }

  const shell = (
    <div
      className={`flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border backdrop-blur-sm ${styles.shell}`}
    >
      <div
        className={`flex shrink-0 items-center gap-2 border-b border-slate-100/80 p-2.5 ${
          effectiveCollapsed ? 'flex-col justify-center' : ''
        }`}
      >
        {effectiveCollapsed && homeHref && (
          <div className="mb-1 flex justify-center lg:flex">
            <BrandMark href={homeHref} size="sm" theme={theme} />
          </div>
        )}

        {isMobileDrawer && onMobileClose && (
          <button
            type="button"
            onClick={onMobileClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 lg:hidden"
            aria-label={closeLabel}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {user && showLabels && (
          <div className="min-w-0 flex-1">
            {user.profileHref ? (
              <Link
                href={user.profileHref}
                className="flex items-center gap-2.5 rounded-xl p-1.5 transition-colors hover:bg-slate-50/80"
                title="My profile"
                onClick={handleNavClick}
              >
                <UserAvatar
                  key={user.avatarId ?? 'avatar-none'}
                  name={user.name}
                  avatarId={user.avatarId}
                  avatarUrl={user.avatarUrl}
                  size="sm"
                  ringClassName={`ring-2 ${theme === 'purple' ? 'ring-purple-200' : 'ring-[#2E6EF3]/25'}`}
                  className={
                    !user.avatarUrl && !user.avatarId
                      ? theme === 'purple'
                        ? 'bg-purple-600'
                        : 'bg-[#2E6EF3]'
                      : ''
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                  {user.subtitle && (
                    <p className="truncate text-xs text-slate-500">{user.subtitle}</p>
                  )}
                </div>
              </Link>
            ) : (
              <div className="flex items-center gap-2.5 p-1.5">
                <UserAvatar
                  key={user.avatarId ?? 'avatar-none'}
                  name={user.name}
                  avatarId={user.avatarId}
                  avatarUrl={user.avatarUrl}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                  {user.subtitle && (
                    <p className="truncate text-xs text-slate-500">{user.subtitle}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {user && effectiveCollapsed && (
          <div className="flex justify-center py-1">
            {user.profileHref ? (
              <Link href={user.profileHref} title="My profile" onClick={handleNavClick}>
                <UserAvatar
                  key={user.avatarId ?? 'avatar-none'}
                  name={user.name}
                  avatarId={user.avatarId}
                  avatarUrl={user.avatarUrl}
                  size="sm"
                  ringClassName={`ring-2 ${theme === 'purple' ? 'ring-purple-200' : 'ring-[#2E6EF3]/25'}`}
                  className={
                    !user.avatarUrl && !user.avatarId
                      ? theme === 'purple'
                        ? 'bg-purple-600'
                        : 'bg-[#2E6EF3]'
                      : ''
                  }
                />
              </Link>
            ) : (
              <UserAvatar
                key={user.avatarId ?? 'avatar-none'}
                name={user.name}
                avatarId={user.avatarId}
                avatarUrl={user.avatarUrl}
                size="sm"
              />
            )}
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden p-2 scrollbar-thin">
        {sections.map((section, sectionIndex) => {
          const isOpen = isSectionOpen(sectionIndex)
          const hasTitle = Boolean(section.title)
          const showItems = !hasTitle || isOpen || effectiveCollapsed

          return (
            <div key={sectionIndex} className={sectionIndex > 0 ? 'mt-3' : ''}>
              {hasTitle && showLabels && (
                <button
                  type="button"
                  onClick={() => toggleSection(sectionIndex)}
                  className="mb-1 flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-50/60"
                >
                  <span
                    className={`text-[11px] font-semibold uppercase tracking-wider ${styles.sectionLabel}`}
                  >
                    {section.title}
                  </span>
                  <svg
                    className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${
                      isOpen ? 'rotate-0' : '-rotate-90'
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                </button>
              )}
              {hasTitle && effectiveCollapsed && section.title && (
                <div className="mb-2 flex justify-center">
                  <span className={`h-px w-6 ${theme === 'purple' ? 'bg-purple-100' : 'bg-slate-200'}`} />
                </div>
              )}
              <div
                className={`space-y-0.5 transition-all duration-200 ${
                  showItems ? 'opacity-100' : 'pointer-events-none h-0 overflow-hidden opacity-0'
                }`}
              >
                {section.items.map((item) => (
                  <NavRow
                    key={item.href + item.name}
                    item={item}
                    isActive={resolveActive(item)}
                    collapsed={effectiveCollapsed}
                    theme={theme}
                    onNavigate={handleNavClick}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </nav>

      {bottomItems && bottomItems.length > 0 && (
        <div className="shrink-0 border-t border-slate-100/60 p-2">
          {bottomItems.map((item) => (
            <NavRow
              key={item.href + item.name}
              item={item}
              isActive={resolveActive(item)}
              collapsed={effectiveCollapsed}
              theme={theme}
              onNavigate={handleNavClick}
            />
          ))}
        </div>
      )}

      {footer && showLabels && (
        <div className="shrink-0 border-t border-slate-100/80 p-2">{footer}</div>
      )}
    </div>
  )

  if (!mounted) {
    return (
      <div
        className={`hidden h-full shrink-0 lg:block ${effectiveCollapsed ? 'w-[4.25rem]' : 'w-64'}`}
        aria-hidden
      />
    )
  }

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[1px] lg:hidden"
          onClick={onMobileClose}
          aria-label={closeLabel}
        />
      )}

      <aside
        className={[
          'relative z-50 flex h-full min-h-0 shrink-0 flex-col transition-[width,transform] duration-300 ease-out',
          mobileOpen
            ? 'fixed left-0 top-16 bottom-0 flex w-[min(18rem,88vw)] max-lg:shadow-2xl'
            : 'max-lg:hidden',
          'lg:relative lg:top-auto lg:z-auto lg:flex lg:shadow-none lg:mr-1',
          effectiveCollapsed ? 'lg:w-[4.25rem]' : 'lg:w-64',
        ].join(' ')}
        aria-hidden={!mobileOpen ? undefined : false}
      >
        {shell}
        <button
          type="button"
          onClick={toggleCollapsed}
          className={`absolute -right-3.5 top-[4.25rem] z-20 hidden h-7 w-7 items-center justify-center rounded-full border-2 transition-all duration-200 lg:flex ${styles.railBtn}`}
          aria-expanded={!effectiveCollapsed}
          aria-label={effectiveCollapsed ? expandLabel : collapseLabel}
          title={effectiveCollapsed ? expandLabel : collapseLabel}
        >
          <RailCollapseIcon collapsed={effectiveCollapsed} />
        </button>
      </aside>
    </>
  )
}
