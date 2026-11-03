'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '@/lib/i18n'

/** ISO 3166-1 alpha-2 codes; names come from Intl.DisplayNames so the list localises itself. */
const ISO_COUNTRY_CODES = [
  'AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AS','AT','AU','AW','AX','AZ',
  'BA','BB','BD','BE','BF','BG','BH','BI','BJ','BL','BM','BN','BO','BQ','BR','BS','BT','BV','BW','BY','BZ',
  'CA','CC','CD','CF','CG','CH','CI','CK','CL','CM','CN','CO','CR','CU','CV','CW','CX','CY','CZ',
  'DE','DJ','DK','DM','DO','DZ','EC','EE','EG','EH','ER','ES','ET','FI','FJ','FK','FM','FO','FR',
  'GA','GB','GD','GE','GF','GG','GH','GI','GL','GM','GN','GP','GQ','GR','GS','GT','GU','GW','GY',
  'HK','HM','HN','HR','HT','HU','ID','IE','IL','IM','IN','IO','IQ','IR','IS','IT','JE','JM','JO','JP',
  'KE','KG','KH','KI','KM','KN','KP','KR','KW','KY','KZ','LA','LB','LC','LI','LK','LR','LS','LT','LU','LV','LY',
  'MA','MC','MD','ME','MF','MG','MH','MK','ML','MM','MN','MO','MP','MQ','MR','MS','MT','MU','MV','MW','MX','MY','MZ',
  'NA','NC','NE','NF','NG','NI','NL','NO','NP','NR','NU','NZ','OM','PA','PE','PF','PG','PH','PK','PL','PM','PN','PR','PS','PT','PW','PY','QA',
  'RE','RO','RS','RU','RW','SA','SB','SC','SD','SE','SG','SH','SI','SJ','SK','SL','SM','SN','SO','SR','SS','ST','SV','SX','SY','SZ',
  'TC','TD','TF','TG','TH','TJ','TK','TL','TM','TN','TO','TR','TT','TV','TW','TZ',
  'UA','UG','UM','US','UY','UZ','VA','VC','VE','VG','VI','VN','VU','WF','WS','YE','YT','ZA','ZM','ZW',
] as const

/** US and Mexico pinned to the top of the list. */
const PINNED = ['US', 'MX']

/** Localized display label for a stored value: ISO code → country name; legacy free text passes through. */
export function countryDisplayLabel(value: string, language: string): string {
  const v = value.trim()
  if (!/^[A-Za-z]{2}$/.test(v)) return v
  try {
    const dn = new Intl.DisplayNames([language === 'es' ? 'es' : 'en'], { type: 'region' })
    return dn.of(v.toUpperCase()) ?? v
  } catch {
    return v
  }
}

type Props = {
  /** ISO alpha-2 code, or a legacy free-text country name. */
  value: string
  onChange: (code: string) => void
  className?: string
  disabled?: boolean
}

/**
 * Searchable country dropdown (custom, not native): full ISO 3166-1 list,
 * localised via Intl.DisplayNames, stores the country code — so a stored
 * answer does not change meaning when the language switches.
 */
export function CountrySelect({ value, onChange, className, disabled }: Props) {
  const { t, language } = useT()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const displayName = useMemo(() => {
    try {
      return new Intl.DisplayNames([language === 'es' ? 'es' : 'en'], { type: 'region' })
    } catch {
      return null
    }
  }, [language])

  const nameOf = (code: string): string => {
    try {
      return displayName?.of(code) ?? code
    } catch {
      return code
    }
  }

  const options = useMemo(() => {
    const rest = ISO_COUNTRY_CODES.filter((c) => !PINNED.includes(c))
      .map((code) => ({ code, name: nameOf(code) }))
      .sort((a, b) => a.name.localeCompare(b.name, language === 'es' ? 'es' : 'en'))
    return [...PINNED.map((code) => ({ code, name: nameOf(code) })), ...rest]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayName, language])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.name.toLowerCase().includes(q) || o.code.toLowerCase() === q)
  }, [options, query])

  const isKnownCode = /^[A-Za-z]{2}$/.test(value) && ISO_COUNTRY_CODES.includes(value.toUpperCase() as (typeof ISO_COUNTRY_CODES)[number])
  const selectedLabel = value ? (isKnownCode ? nameOf(value.toUpperCase()) : value) : ''

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    searchRef.current?.focus()
    const onDocMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [open])

  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, filtered.length])

  const select = (code: string) => {
    onChange(code)
    setOpen(false)
  }

  const onSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opt = filtered[activeIndex]
      if (opt) select(opt.code)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if ((e.key === 'ArrowDown' || e.key === 'Enter') && !open) {
            e.preventDefault()
            setOpen(true)
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`${className ?? ''} flex items-center justify-between gap-2 text-left`}
      >
        <span className={selectedLabel ? 'text-slate-900' : 'text-slate-400'}>
          {selectedLabel || t('imm_intake.country_select')}
        </span>
        <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="p-2 border-b border-slate-100">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActiveIndex(0)
              }}
              onKeyDown={onSearchKeyDown}
              placeholder={t('imm_intake.country_search')}
              className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            />
          </div>
          <ul ref={listRef} role="listbox" className="max-h-56 overflow-y-auto py-1">
            {value && (
              <li>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => select('')}
                  className="w-full px-3 py-1.5 text-left text-sm text-slate-400 hover:bg-slate-50"
                >
                  —
                </button>
              </li>
            )}
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-400">{t('common.na')}</li>
            ) : (
              filtered.map((opt, i) => (
                <li key={opt.code} role="option" aria-selected={value.toUpperCase() === opt.code}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => select(opt.code)}
                    className={`w-full px-3 py-1.5 text-left text-sm ${
                      i === activeIndex ? 'bg-violet-50 text-violet-800' : 'text-slate-800 hover:bg-slate-50'
                    } ${value.toUpperCase() === opt.code ? 'font-semibold' : ''}`}
                  >
                    {opt.name}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
