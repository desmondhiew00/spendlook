import { useLingui } from '@lingui/react'
import { CATEGORY_LABEL } from '@/components/category-label'
import { type Category, type Flow, INCOME, SPENDING } from '@/lib/types'

export function CategorySelect({ flow, value, onChange, label }: { flow: Flow; value: Category; onChange: (c: Category) => void; label: string }) {
  const { i18n } = useLingui()
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as Category)} className="rounded border bg-background px-1 py-0.5 text-sm">
      {(flow === 'expense' ? SPENDING : INCOME).map((c) => <option key={c} value={c}>{i18n._(CATEGORY_LABEL[c])}</option>)}
    </select>
  )
}
