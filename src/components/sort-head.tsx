import { cn } from 'cn'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { TableHead } from '@/components/ui/table'
import type { SortState } from '@/lib/sort'

export function useSort<K extends string>(key: K, desc = true) {
  const [sort, setSort] = useState<SortState<K>>({ key, desc })
  // re-click flips; a new column starts in its natural direction (numbers/dates high→low, text A→Z)
  const toggle = (k: K, firstDesc: boolean) => setSort((s) => (s.key === k ? { key: k, desc: !s.desc } : { key: k, desc: firstDesc }))
  return [sort, toggle, setSort] as const
}

export function SortHead<K extends string>({ k, sort, onSort, firstDesc = false, right, children }: { k: K; sort: SortState<K>; onSort: (k: K, firstDesc: boolean) => void; firstDesc?: boolean; right?: boolean; children: ReactNode }) {
  const active = sort.key === k
  const Icon = !active ? ArrowUpDown : sort.desc ? ArrowDown : ArrowUp
  return (
    <TableHead aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : 'none'} className={right ? 'text-right' : undefined}>
      <button type="button" onClick={() => onSort(k, firstDesc)} className={cn('inline-flex cursor-pointer items-center gap-1 transition-colors hover:text-foreground', active ? 'text-foreground' : 'text-muted-foreground', right && 'flex-row-reverse')}>
        {children}
        <Icon className={cn('size-3.5', !active && 'opacity-50')} aria-hidden="true" />
      </button>
    </TableHead>
  )
}
