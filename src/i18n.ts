import { i18n } from '@lingui/core'
import { messages as en } from './locales/en.po'
import { messages as ja } from './locales/ja.po'
import { messages as zh } from './locales/zh.po'

export type Locale = 'en' | 'ja' | 'zh' // zh = Simplified Chinese

i18n.load({ en, ja, zh })

// /ja is the Japanese landing URL (own head tags for search engines), so it wins over a saved choice
function initialLocale(): Locale {
  if (location.pathname === '/ja') return 'ja'
  try {
    const saved = localStorage.getItem('locale')
    if (saved === 'en' || saved === 'ja' || saved === 'zh') return saved
  } catch {}
  const nav = navigator.language
  return nav.startsWith('ja') ? 'ja' : nav.startsWith('zh') ? 'zh' : 'en'
}

function activate(l: Locale) {
  i18n.activate(l)
  document.documentElement.lang = l === 'zh' ? 'zh-Hans' : l
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
