'use client'

import { useT, type Language } from '@/lib/i18n'

interface LanguageToggleProps {
  className?: string
}

export function LanguageToggle({ className = '' }: LanguageToggleProps) {
  const { language, setLanguage } = useT()

  const options: { value: Language; label: string }[] = [
    { value: 'en', label: 'EN' },
    { value: 'es', label: 'ES' },
  ]

  return (
    <div
      className={`inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 ${className}`}
      role="group"
      aria-label="Language"
    >
      {options.map((opt) => {
        const active = language === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setLanguage(opt.value)}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
              active
                ? 'bg-[#2E6EF3] text-white'
                : 'text-slate-500 hover:text-slate-700'
            }`}
            aria-pressed={active}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
