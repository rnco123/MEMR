'use client'

import { useT } from '@/lib/i18n'
import { useAddressSuggestions, type AddressSuggestion } from '@/lib/address/use-address-suggestions'

type Props = {
  value: string
  onChange: (value: string) => void
  /** Optional hook for callers that also store parsed components. */
  onSelect?: (suggestion: AddressSuggestion) => void
  label?: string
  placeholder?: string
  className?: string
  disabled?: boolean
  minQueryLength?: number
}

export function AddressLookupInput({
  value,
  onChange,
  onSelect,
  label,
  placeholder,
  className = 'mt-1 w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900',
  disabled = false,
  minQueryLength = 4,
}: Props) {
  const { t } = useT()
  const { suggestions, loading, lookupEnabled, suppressUntilNextEdit, resumeLookup, suppressed } =
    useAddressSuggestions({ query: value, minQueryLength, disabled })

  const applySuggestion = (suggestion: AddressSuggestion) => {
    suppressUntilNextEdit(suggestion.fullAddress)
    onChange(suggestion.fullAddress)
    onSelect?.(suggestion)
  }

  const onTyped = (next: string) => {
    resumeLookup()
    onChange(next)
  }

  const showSuggestions = suggestions.length > 0 && !disabled && !suppressed

  return (
    <div className="relative">
      {label ? <label className="text-sm text-slate-700">{label}</label> : null}
      <input
        value={value}
        onChange={(e) => onTyped(e.target.value)}
        className={className}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="street-address"
      />
      {loading ? <p className="text-xs text-slate-400 mt-1">{t('address.lookup_searching')}</p> : null}
      {lookupEnabled === false && value.trim().length >= minQueryLength ? (
        <p className="text-xs text-slate-400 mt-1">{t('address.lookup_unconfigured')}</p>
      ) : null}
      {showSuggestions ? (
        <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {suggestions.map((suggestion, index) => (
            <li key={`${suggestion.fullAddress}-${index}`}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applySuggestion(suggestion)}
              >
                {suggestion.fullAddress}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
