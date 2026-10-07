import { useLingui } from '@lingui/react'
import { Picker } from '@/components/picker'
import { type Locale, setLocale } from '@/i18n'

export function LocaleToggle() {
  const { i18n } = useLingui()
  return (
    <Picker<Locale> size="sm" label="Language" value={i18n.locale as Locale} onChange={setLocale} className="kicker" options={[{ value: 'en', label: 'EN' }, { value: 'ja', label: '日本語' }]} />
  )
}
