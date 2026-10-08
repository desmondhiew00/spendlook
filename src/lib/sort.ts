export interface SortState<K extends string> {
  key: K
  desc: boolean
}

// stable: rows equal on the key keep their incoming order
export function sortRows<T>(rows: T[], get: (r: T) => string | number, desc: boolean, locale?: string): T[] {
  const cmp = (a: T, b: T) => {
    const x = get(a)
    const y = get(b)
    return typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), locale)
  }
  return [...rows].sort((a, b) => (desc ? cmp(b, a) : cmp(a, b)))
}
