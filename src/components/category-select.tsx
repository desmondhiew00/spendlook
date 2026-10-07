import { useLingui } from '@lingui/react'
import { CATEGORY_LABEL } from '@/components/category-label'
import { Picker } from '@/components/picker'
import { type Category, type Flow, INCOME, SPENDING } from '@/lib/types'

export function CategorySelect({ flow, value, onChange, label }: { flow: Flow; value: Category; onChange: (c: Category) => void; label: string }) {
  const { i18n } = useLingui()
  return (
    <Picker<Category> size="sm" label={label} value={value} onChange={onChange} className="min-w-36" options={(flow === 'expense' ? SPENDING : INCOME).map((c) => ({ value: c, label: i18n._(CATEGORY_LABEL[c]) }))} />
  )
}
