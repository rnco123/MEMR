'use client'

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '@/lib/i18n'
import { splitAddressForPatientRecord } from '@/lib/address/parse-patient-address'
import { normalizeStateAbbrev } from '@/lib/i693/ai-fill'
import { useAddressSuggestions, type AddressSuggestion } from '@/lib/address/use-address-suggestions'

type Props = {
  streetAddress: string
  state: string
  zipCode: string
  onStreetAddressChange: (value: string) => void
  onStateChange: (value: string) => void
  onZipCodeChange: (value: string) => void
  streetLabel: string
  stateLabel: string
  zipLabel: string
  streetPlaceholder?: string
  inputClassName?: string
  disabled?: boolean
  addressColSpanClass?: string
}

function useDropdownPosition(
  anchorRef: RefObject<HTMLElement | null>,
  open: boolean
) {
  const [style, setStyle] = useState<{ top: number; left: number; width: number } | null>(null)

  const update = useCallback(() => {
    const el = anchorRef.current
    if (!el) {
      setStyle(null)
      return
    }
    const rect = el.getBoundingClientRect()
    setStyle({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    })
  }, [anchorRef])

  useEffect(() => {
    if (!open) {
      setStyle(null)
      return
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open, update])

  return style
}

export function AddressLookupFields({
  streetAddress,
  state,
  zipCode,
  onStreetAddressChange,
  onStateChange,
  onZipCodeChange,
  streetLabel,
  stateLabel,
  zipLabel,
  streetPlaceholder,
  inputClassName = 'w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900',
  disabled = false,
  addressColSpanClass = 'md:col-span-2',
}: Props) {
  const { t } = useT()
  const streetFieldRef = useRef<HTMLDivElement>(null)
  const { suggestions, loading, lookupEnabled, suppressUntilNextEdit, resumeLookup, suppressed } =
    useAddressSuggestions({ query: streetAddress, minQueryLength: 4, disabled })

  const applySuggestion = (suggestion: AddressSuggestion) => {
    // Prefer Mapbox's structured components; fall back to parsing the label.
    const parsed = splitAddressForPatientRecord(suggestion.fullAddress)
    const nextStreet = (suggestion.streetAddress || parsed.street_address).trim()
    const nextState = normalizeStateAbbrev(suggestion.state || parsed.state)
    const nextZip = suggestion.zipCode || parsed.zip_code

    // Remember the value written into the street field (not the full place label),
    // otherwise the lookup effect treats it as new typing and reopens the list.
    suppressUntilNextEdit(nextStreet)
    onStreetAddressChange(nextStreet)
    onStateChange(nextState.toUpperCase().slice(0, 2))
    onZipCodeChange(nextZip)
  }

  const onStreetTyped = (value: string) => {
    resumeLookup()
    onStreetAddressChange(value)
  }

  const showSuggestions = suggestions.length > 0 && !disabled && !suppressed
  const dropdownStyle = useDropdownPosition(streetFieldRef, showSuggestions)

  return (
    <>
      <div ref={streetFieldRef} className={`relative ${addressColSpanClass}`}>
        <label className="text-slate-500 text-sm mb-1 font-semibold block">{streetLabel}</label>
        <input
          value={streetAddress}
          onChange={(e) => onStreetTyped(e.target.value)}
          className={inputClassName}
          placeholder={streetPlaceholder}
          disabled={disabled}
          autoComplete="street-address"
        />
        {loading ? (
          <p className="text-xs text-slate-400 mt-1">{t('address.lookup_searching')}</p>
        ) : null}
        {lookupEnabled === false && streetAddress.trim().length >= 4 ? (
          <p className="text-xs text-slate-400 mt-1">{t('address.lookup_unconfigured')}</p>
        ) : null}
      </div>
      {showSuggestions && dropdownStyle && typeof document !== 'undefined'
        ? createPortal(
            <ul
              style={{
                position: 'fixed',
                top: dropdownStyle.top,
                left: dropdownStyle.left,
                width: dropdownStyle.width,
                zIndex: 9999,
              }}
              className="max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg"
            >
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
            </ul>,
            document.body
          )
        : null}
      <div>
        <label className="text-slate-500 text-sm mb-1 font-semibold block">{stateLabel}</label>
        <input
          value={state}
          onChange={(e) => onStateChange(e.target.value.toUpperCase().slice(0, 2))}
          className={inputClassName}
          disabled={disabled}
          autoComplete="address-level1"
          maxLength={2}
          placeholder="TX"
        />
      </div>
      <div>
        <label className="text-slate-500 text-sm mb-1 font-semibold block">{zipLabel}</label>
        <input
          value={zipCode}
          onChange={(e) => onZipCodeChange(e.target.value.replace(/[^\d-]/g, '').slice(0, 10))}
          className={inputClassName}
          disabled={disabled}
          autoComplete="postal-code"
          placeholder="77002"
        />
      </div>
    </>
  )
}
