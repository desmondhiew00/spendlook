import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export interface PickerOption<V extends string> { value: V; label: string }

// Styled single-select over Base UI; `items` makes the trigger show the label, not the raw value
export function Picker<V extends string>({ value, onChange, options, label, size, className }: { value: V; onChange: (v: V) => void; options: PickerOption<V>[]; label: string; size?: 'sm' | 'default'; className?: string }) {
  return (
    <Select items={options} value={value} onValueChange={(v) => v !== null && onChange(v as V)}>
      <SelectTrigger aria-label={label} size={size} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}
