'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { dictionaries, formatTemplate, type Language, SUPPORTED_LANGUAGES } from './dictionaries'

const STORAGE_KEY = 'memr.lang'

interface I18nContextValue {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

function isLanguage(value: string | null): value is Language {
  return !!value && (SUPPORTED_LANGUAGES as string[]).includes(value)
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en')

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (isLanguage(stored)) {
        setLanguageState(stored)
        return
      }
      const browser = (window.navigator?.language || 'en').toLowerCase()
      if (browser.startsWith('es')) setLanguageState('es')
    } catch {
      // ignore storage errors
    }
  }, [])

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang)
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, lang)
        document.documentElement.lang = lang
      }
    } catch {
      // ignore storage errors
    }
  }, [])

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language
    }
  }, [language])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const dict = dictionaries[language] || dictionaries.en
      const fallback = dictionaries.en[key]
      const template = dict[key] ?? fallback ?? key
      return formatTemplate(template, vars)
    },
    [language]
  )

  const value = useMemo<I18nContextValue>(() => ({ language, setLanguage, t }), [language, setLanguage, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useT(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    return {
      language: 'en',
      setLanguage: () => {},
      t: (key, vars) => formatTemplate(dictionaries.en[key] ?? key, vars),
    }
  }
  return ctx
}

export type { Language }
