import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export interface PickerOption<V extends string> {
  value: V
  label: string
  color?: string
}

const Swatch = ({ color }: { color?: string }) => (color ? <span aria-hidden="true" className="size-2.5 shrink-0 self-center rounded-full" style={{ background: color }} /> : null)

// Styled single-select over Base UI; trigger and items show an optional colour swatch before the label
export function Picker<V extends string>({
  value,
  onChange,
  options,
  label,
  size,
  className,
}: {
  value: V
  onChange: (v: V) => void
  options: PickerOption<V>[]
  label: string
  size?: 'sm' | 'default'
  className?: string
}) {
  return (
    <Select items={options} value={value} onValueChange={(v) => v !== null && onChange(v as V)}>
      <SelectTrigger aria-label={label} size={size} className={className}>
        <SelectValue>
          {(v: V) => {
            const o = options.find((x) => x.value === v)
            return (
              <>
                <Swatch color={o?.color} />
                {o?.label}
              </>
            )
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            <Swatch color={o.color} />
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
