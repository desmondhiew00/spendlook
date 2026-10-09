import { type Category, type Flow, INCOME, type Merchant, SPENDING, type Txn, merchantId, merchantName } from './types'

type Resolve = (t: Txn) => Category

export function resolveCategory(t: Txn, merchants: Map<string, Merchant>): Category {
  if (t.overrideCategory) return t.overrideCategory
  if (t.fixedCategory) return t.fixedCategory
  const m = merchants.get(merchantId(t.kind as Flow, t.merchantKey))
  return m?.overrideCategory ?? m?.aiCategory ?? (t.kind === 'income' ? 'other_income' : 'other')
}

function sumBy<K>(txns: Txn[], keyOf: (t: Txn) => K) {
  const out = new Map<K, number>()
  for (const t of txns) out.set(keyOf(t), (out.get(keyOf(t)) ?? 0) + t.amount)
  return out
}

export function monthlyTotals(txns: Txn[]) {
  return [...sumBy(txns, (t) => t.month)].map(([month, total]) => ({ month, total })).sort((a, b) => a.month.localeCompare(b.month))
}

export function byCategoryMonth(txns: Txn[], resolve: Resolve) {
  const rows = new Map<string, { month: string } & Partial<Record<Category, number>>>()
  const categories = new Set<Category>()
  for (const t of txns) {
    const c = resolve(t)
    categories.add(c)
    const row = rows.get(t.month) ?? { month: t.month }
    row[c] = (row[c] ?? 0) + t.amount
    rows.set(t.month, row)
  }
  return { rows: [...rows.values()].sort((a, b) => a.month.localeCompare(b.month)), categories: [...categories] }
}

export function categoryTotals(txns: Txn[], resolve: Resolve) {
  return [...sumBy(txns, resolve)].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total)
}

// Grouped by shown name (case-insensitive), so merchants renamed to the same name share one row
export function merchantTotals(txns: Txn[], merchants: Map<string, Merchant>) {
  const out = new Map<string, { id: string; ids: string[]; name: string; raw: string; total: number; count: number }>()
  for (const t of txns) {
    const id = merchantId(t.kind as Flow, t.merchantKey)
    const name = merchantName(merchants.get(id), t.rawMerchant)
    const key = `${t.kind}|${name.toLowerCase()}`
    const raw = t.rawMerchant.normalize('NFKC')
    const row = out.get(key) ?? { id, ids: [], name, raw, total: 0, count: 0 }
    if (!row.ids.includes(id)) {
      if (row.ids.length && !row.raw.split(' · ').includes(raw)) row.raw += ` · ${raw}`
      row.ids.push(id)
    }
    row.total += t.amount
    row.count++
    out.set(key, row)
  }
  return [...out.values()].sort((a, b) => b.total - a.total)
}

// Chart series: the n largest categories (fold bucket excluded), in fixed list order so each keeps a stable color slot
export function topCategories(txns: Txn[], resolve: Resolve, n: number, fold: Category, order: readonly Category[] = [...SPENDING, ...INCOME]): Category[] {
  const top = categoryTotals(txns, resolve)
    .filter((c) => c.category !== fold && c.total > 0)
    .slice(0, n)
    .map((c) => c.category)
  return top.sort((a, b) => order.indexOf(a) - order.indexOf(b))
}

// Every month with rows (excluded ones too, so they stay reachable in the table)
export function monthOptions(txns: Txn[]): string[] {
  return [...new Set(txns.map((t) => t.month))].sort()
}

export function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}
