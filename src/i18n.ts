import { i18n } from '@lingui/core'
import { messages as en } from './locales/en.po'
import { messages as ja } from './locales/ja.po'

export type Locale = 'en' | 'ja'

i18n.load({ en, ja })

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem('locale')
    if (saved === 'en' || saved === 'ja') return saved
  } catch {}
  return navigator.language.startsWith('ja') ? 'ja' : 'en'
}

function activate(l: Locale) {
  i18n.activate(l)
  document.documentElement.lang = l
}

// only an explicit choice is saved; the browser-language default is re-detected each visit
export function setLocale(l: Locale) {
  try {
    localStorage.setItem('locale', l)
  } catch {}
  activate(l)
}

activate(initialLocale())

export { i18n }
