'use client'

import { looksLikeDateSearchInput } from '@/lib/nurse/patient-search-query'

type SearchSize = 'sm' | 'md' | 'lg'

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder: string
  className?: string
  inputClassName?: string
  type?: 'search' | 'text'
  /** @deprecated use size="md" */
  compact?: boolean
  size?: SearchSize
  loading?: boolean
}

const SIZE_STYLES: Record<
  SearchSize,
  { shell: string; input: string; leftPad: string; icon: string }
> = {
  sm: {
    shell: 'h-9 rounded-lg',
    input: 'text-sm',
    leftPad: 'pl-9',
    icon: 'h-4 w-4',
  },
  md: {
    shell: 'h-10 rounded-xl',
    input: 'text-sm',
    leftPad: 'pl-10',
    icon: 'h-4 w-4',
  },
  lg: {
    shell: 'h-11 rounded-xl',
    input: 'text-sm',
    leftPad: 'pl-10',
    icon: 'h-[18px] w-[18px]',
  },
}

function SearchIcon({ className }: { className: string }) {
  return (
    <svg
      className={`${className} text-slate-400`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  )
}

function SearchSpinner({ className }: { className: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

export function SmartPatientSearchInput({
  value,
  onChange,
  placeholder,
  className = '',
  inputClassName = '',
  type = 'text',
  compact = false,
  size,
  loading = false,
}: Props) {
  const resolvedSize: SearchSize = size ?? (compact ? 'md' : 'lg')
  const styles = SIZE_STYLES[resolvedSize]
  const isDateQuery = looksLikeDateSearchInput(value)

  return (
    <div className={`relative flex-1 min-w-0 ${className}`}>
      <div
        className={`flex w-full items-center gap-2 bg-[#f9fbff] ${styles.shell} border pr-2 transition-shadow focus-within:ring-2 focus-within:ring-[#2E6EF3] focus-within:border-transparent ${
          isDateQuery ? 'border-violet-300 ring-1 ring-violet-100' : 'border-slate-200'
        } ${inputClassName}`}
      >
        <div className="pointer-events-none shrink-0 pl-3">
          <SearchIcon className={styles.icon} />
        </div>

        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-busy={loading}
          className={`min-w-0 flex-1 border-0 bg-transparent py-0 ${styles.input} text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0`}
        />

        <div className="flex shrink-0 items-center gap-1.5">
          {loading && <SearchSpinner className={`${styles.icon} text-violet-500`} />}
        </div>
      </div>
    </div>
  )
}
