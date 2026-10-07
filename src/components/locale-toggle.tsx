import { useLingui } from '@lingui/react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { Picker } from '@/components/picker'
import { type Locale, setLocale } from '@/i18n'

export function LocaleToggle() {
  const { i18n } = useLingui()
  const path = useLocation({ select: (l) => l.pathname })
  const navigate = useNavigate()
  const change = (l: Locale) => {
    setLocale(l)
    // the home page has a URL per language; keep it matching so the URL can be shared
    if (path === '/' || path === '/ja') navigate({ to: l === 'ja' ? '/ja' : '/' })
  }
  return (
    <Picker<Locale> size="sm" label="Language" value={i18n.locale as Locale} onChange={change} className="kicker" options={[{ value: 'en', label: 'EN' }, { value: 'ja', label: '日本語' }]} />
  )
}
