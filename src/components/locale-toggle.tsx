import { useLingui } from '@lingui/react'
import { type Locale, setLocale } from '@/i18n'

export function LocaleToggle() {
  const { i18n } = useLingui()
  return (
    <select aria-label="Language" value={i18n.locale} onChange={(e) => setLocale(e.target.value as Locale)} className="rounded border bg-background px-2 py-1 text-sm">
      <option value="en">EN</option>
      <option value="ja">日本語</option>
    </select>
  )
}
