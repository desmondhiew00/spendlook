import { useLingui } from '@lingui/react'
import { CATEGORY_LABEL } from '@/components/category-label'
import { Picker } from '@/components/picker'
import { type Category, type Flow, INCOME, SPENDING } from '@/lib/types'

// colorOf matches the dashboard chart, so a category reads the same colour everywhere
export function CategorySelect({ flow, value, onChange, label, colorOf }: { flow: Flow; value: Category; onChange: (c: Category) => void; label: string; colorOf?: (c: Category) => string }) {
  const { i18n } = useLingui()
  return (
    <Picker<Category> size="sm" label={label} value={value} onChange={onChange} className="min-w-36" options={(flow === 'expense' ? SPENDING : INCOME).map((c) => ({ value: c, label: i18n._(CATEGORY_LABEL[c]), color: colorOf?.(c) }))} />
  )
}
