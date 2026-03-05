'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { LOCALE_COOKIE, LOCALE_STORAGE_KEY } from '@/i18n'
import enMessages from '@/messages/en.json'
import hiMessages from '@/messages/hi.json'
import teMessages from '@/messages/te.json'

export type Locale = 'en' | 'hi' | 'te'

// ──────────────────────────────────────────────────────────────────────────
// Translation dictionaries loaded from JSON files
// Supports {{variable}} interpolation via t(key, { variable: value })
// ──────────────────────────────────────────────────────────────────────────
const translations: Record<Locale, Record<string, string>> = {
  en: enMessages as Record<string, string>,
  hi: hiMessages as Record<string, string>,
  te: teMessages as Record<string, string>,
}

// ──────────────────────────────────────────────────────────────────────────
// Context
// ──────────────────────────────────────────────────────────────────────────
interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  /** Translate a key, with optional {{variable}} interpolation */
  t: (key: string, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  setLocale: () => {},
  t: (key) => key,
})

const LANG_ATTR: Record<Locale, string> = { en: 'en',hi: 'hi', te: 'te' }

/** Read locale cookie set by middleware (server-side detection) */
function readLocaleCookie(): Locale | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${LOCALE_COOKIE}=`))
  return (match?.split('=')?.[1] as Locale) ?? null
}

/** Write locale to cookie so middleware sees it on next request */
function writeLocaleCookie(locale: Locale) {
  if (typeof document === 'undefined') return
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; SameSite=Lax`
}

// Initialize locale from storage (runs before first render on client)
function getInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en'
  
  // Check localStorage first
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null
  if (stored && ['en', 'hi', 'te'].includes(stored)) {
    return stored
  }
  
  // Check cookie as fallback
  const cookie = readLocaleCookie()
  if (cookie && ['en', 'hi', 'te'].includes(cookie)) {
    return cookie
  }
  
  return 'en'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    // Ensure HTML lang attribute is set
    if (typeof document !== 'undefined') {
      document.documentElement.lang = LANG_ATTR[locale]
    }
  }, [locale])

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale)
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCALE_STORAGE_KEY, newLocale)
      writeLocaleCookie(newLocale)
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = LANG_ATTR[newLocale]
    }
  }, [])

  const t = useCallback((key: string, vars?: Record<string, string | number>): string => {
    let str = translations[locale]?.[key] ?? translations['en']?.[key] ?? key
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v))
      }
    }
    return str
  }, [locale])

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  return useContext(I18nContext)
}

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  hi: 'हिंदी',
  te: 'తెలుగు',
}
