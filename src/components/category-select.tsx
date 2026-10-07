import { Combobox as ComboboxPrimitive } from '@base-ui/react'
import { useLingui } from '@lingui/react/macro'
import { ChevronDownIcon } from 'lucide-react'
import { CATEGORY_LABEL } from '@/components/category-label'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/components/ui/combobox'
import { type Category, type Flow, INCOME, SPENDING } from '@/lib/types'

interface Option { value: Category; label: string; color?: string }

const Swatch = ({ color }: { color?: string }) => (color ? <span aria-hidden="true" className="size-2.5 shrink-0" style={{ background: color }} /> : null)

// Searchable picker. One per table row, so it stays cheap: the trigger is a plain button and the popup
// (search box + list) mounts only while open. colorOf matches the dashboard chart.
export function CategorySelect({ flow, value, onChange, label, colorOf }: { flow: Flow; value: Category; onChange: (c: Category) => void; label: string; colorOf?: (c: Category) => string }) {
  const { t, i18n } = useLingui()
  const options: Option[] = (flow === 'expense' ? SPENDING : INCOME).map((c) => ({ value: c, label: i18n._(CATEGORY_LABEL[c]), color: colorOf?.(c) }))
  const selected = options.find((o) => o.value === value) ?? null
  return (
    <Combobox<Option>
      items={options}
      value={selected}
      onValueChange={(o) => o && o.value !== value && onChange(o.value)}
      itemToStringLabel={(o) => o.label}
      isItemEqualToValue={(a, b) => a.value === b.value}
      // the label in the current language, or the English key ("dining"), so either finds it
      filter={(o, q) => { const s = q.trim().toLowerCase(); return !s || o.label.toLowerCase().includes(s) || o.value.replaceAll('_', ' ').includes(s) }}
      autoHighlight
    >
      <ComboboxPrimitive.Trigger
        aria-label={label}
        title={selected?.label}
        className="flex h-7 w-44 max-w-full items-center gap-1.5 rounded-[min(var(--radius-md),10px)] border border-input bg-transparent pr-1.5 pl-2.5 text-sm outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50"
      >
        <Swatch color={selected?.color} />
        <span className="min-w-0 flex-1 truncate text-left">{selected?.label}</span>
        <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </ComboboxPrimitive.Trigger>
      <ComboboxContent className="w-60">
        <ComboboxInput showTrigger={false} placeholder={t`Search categories`} aria-label={t`Search categories`} />
        <ComboboxEmpty>{t`No matching category`}</ComboboxEmpty>
        <ComboboxList>
          {(o: Option) => (
            <ComboboxItem key={o.value} value={o}>
              <Swatch color={o.color} />
              <span className="min-w-0 flex-1">{o.label}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
