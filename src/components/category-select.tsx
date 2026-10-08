import { Combobox as ComboboxPrimitive } from '@base-ui/react'
import { useLingui } from '@lingui/react/macro'
import { cn } from 'cn'
import { ChevronDownIcon } from 'lucide-react'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/components/ui/combobox'
import type { Categories } from '@/components/use-categories'
import type { Category, Flow } from '@/lib/types'

interface Option<V> {
  value: V
  label: string
  color?: string
}

const Swatch = ({ color }: { color?: string }) => (color ? <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: color }} /> : null)

// Searchable picker. One per table row, so it stays cheap: the trigger is a plain button and the popup
// (search box + list) mounts only while open. colorOf matches the dashboard chart.
// allLabel adds a leading '' option ("All categories") so it doubles as a filter.
export function CategorySelect<V extends Category | '' = Category>({
  cats,
  flow,
  value,
  onChange,
  label,
  colorOf,
  allLabel,
  className,
}: {
  cats: Categories
  flow: Flow
  value: V
  onChange: (c: V) => void
  label: string
  colorOf?: (c: Category) => string
  allLabel?: string
  className?: string
}) {
  const { t } = useLingui()
  const options: Option<V>[] = [
    ...(allLabel ? [{ value: '' as V, label: allLabel }] : []),
    ...cats.options(flow, value || undefined).map((c) => ({ value: c as V, label: cats.label(c), color: colorOf?.(c) })),
  ]
  const selected = options.find((o) => o.value === value) ?? null
  return (
    <Combobox<Option<V>>
      items={options}
      value={selected}
      onValueChange={(o) => o && o.value !== value && onChange(o.value)}
      itemToStringLabel={(o) => o.label}
      isItemEqualToValue={(a, b) => a.value === b.value}
      // the label in the current language, or the English key ("dining"), so either finds it
      filter={(o, q) => {
        const s = q.trim().toLowerCase()
        return !s || o.label.toLowerCase().includes(s) || o.value.replaceAll('_', ' ').includes(s)
      }}
      autoHighlight
    >
      <ComboboxPrimitive.Trigger
        aria-label={label}
        title={selected?.label}
        className={cn(
          'flex h-7 w-44 max-w-full items-center gap-1.5 rounded-[7px] bg-muted pr-1.5 pl-2.5 text-sm outline-none select-none hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/50',
          className,
        )}
      >
        <Swatch color={selected?.color} />
        <span className="min-w-0 flex-1 truncate text-left">{selected?.label}</span>
        <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </ComboboxPrimitive.Trigger>
      <ComboboxContent className="w-60">
        <ComboboxInput showTrigger={false} placeholder={t`Search categories`} aria-label={t`Search categories`} />
        <ComboboxEmpty>{t`No matching category`}</ComboboxEmpty>
        <ComboboxList>
          {(o: Option<V>) => (
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
