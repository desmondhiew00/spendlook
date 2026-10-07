import { type Category, type Flow, INCOME, type Merchant, SPENDING, type Txn, merchantId } from './types'

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
  return [...sumBy(txns, (t) => t.month)]
    .map(([month, total]) => ({ month, total }))
    .sort((a, b) => a.month.localeCompare(b.month))
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

export function merchantTotals(txns: Txn[], merchants: Map<string, Merchant>) {
  const out = new Map<string, { id: string; name: string; total: number; count: number }>()
  for (const t of txns) {
    const id = merchantId(t.kind as Flow, t.merchantKey)
    const row = out.get(id) ?? { id, name: merchants.get(id)?.displayName ?? t.rawMerchant.normalize('NFKC'), total: 0, count: 0 }
    row.total += t.amount
    row.count++
    out.set(id, row)
  }
  return [...out.values()].sort((a, b) => b.total - a.total)
}

// Chart series: the n largest categories (fold bucket excluded), in fixed list order so each keeps a stable color slot
export function topCategories(txns: Txn[], resolve: Resolve, n: number, fold: Category): Category[] {
  const order: readonly Category[] = [...SPENDING, ...INCOME]
  const top = categoryTotals(txns, resolve).filter((c) => c.category !== fold && c.total > 0).slice(0, n).map((c) => c.category)
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
