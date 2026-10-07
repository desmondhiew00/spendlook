import { Trans, useLingui } from '@lingui/react/macro'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CATEGORY_LABEL, FOLD_COLOR, SERIES_COLORS } from '@/components/category-label'
import { CategorySelect } from '@/components/category-select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { byCategoryMonth, categoryTotals, merchantTotals, monthlyTotals, resolveCategory, topCategories } from '@/lib/aggregate'
import { db } from '@/lib/db'
import { formatMoney, formatMonth } from '@/lib/format'
import { type Category, type Flow, INCOME, SPENDING, type Txn, merchantId } from '@/lib/types'

export function Dashboard({ accountId, currency, flow, hasMethod }: { accountId: string; currency: string; flow: Flow; hasMethod: boolean }) {
  const { t, i18n } = useLingui()
  const locale = i18n.locale
  const yen = (n: number) => formatMoney(n, currency, locale)
  const allTxns = useLiveQuery(() => db.txns.where('accountId').equals(accountId).toArray(), [accountId])
  const merchantList = useLiveQuery(() => db.merchants.toArray(), [])
  const merchants = useMemo(() => new Map((merchantList ?? []).map((m) => [m.id, m])), [merchantList])
  const resolve = (tx: Txn) => resolveCategory(tx, merchants)

  const txns = useMemo(() => (allTxns ?? []).filter((x) => x.kind === flow), [allTxns, flow])
  // excluded rows stay in the transaction table (so they can be un-excluded) but never count
  const counted = useMemo(() => txns.filter((x) => resolveCategory(x, merchants) !== 'excluded'), [txns, merchants])
  const totals = useMemo(() => monthlyTotals(counted), [counted])
  const [pickedMonth, setPickedMonth] = useState<string>()
  const month = pickedMonth ?? totals.at(-1)?.month
  const [category, setCategory] = useState<Category | ''>('')
  const [search, setSearch] = useState('')
  const [method, setMethod] = useState('')
  const [reviewOnly, setReviewOnly] = useState(false)

  if (!allTxns || !merchantList) return null
  if (!txns.length) return <p className="text-sm text-muted-foreground"><Trans>No transactions yet. Upload a CSV above.</Trans></p>

  const idx = totals.findIndex((x) => x.month === month)
  const current = totals[idx]?.total ?? 0
  const previous = idx > 0 ? totals[idx - 1].total : undefined
  const change = previous ? ((current - previous) / Math.abs(previous)) * 100 : undefined
  const monthTxns = txns.filter((x) => x.month === month)
  const monthCounted = counted.filter((x) => x.month === month)
  // chart: 7 largest categories keep a color slot; everything else folds into the gray Other bucket
  const fold: Category = flow === 'expense' ? 'other' : 'other_income'
  const top = topCategories(counted, resolve, SERIES_COLORS.length, fold)
  const colorOf = (c: Category) => (top.includes(c) ? SERIES_COLORS[top.indexOf(c)] : FOLD_COLOR)
  const stacked = byCategoryMonth(counted, (x) => {
    const c = resolve(x)
    return top.includes(c) ? c : fold
  })
  const series = [...top, ...(stacked.categories.includes(fold) ? [fold] : [])]
  const needsReview = (tx: Txn) => {
    if (tx.overrideCategory || tx.fixedCategory) return false
    const m = merchants.get(merchantId(flow, tx.merchantKey))
    return !m?.overrideCategory && (m?.needsReview ?? true)
  }
  const methods = [...new Set(txns.map((x) => x.method).filter(Boolean))] as string[]
  const q = search.trim().toLowerCase()
  const rows = monthTxns
    .filter((x) => !category || resolve(x) === category)
    .filter((x) => !method || x.method === method)
    .filter((x) => !reviewOnly || needsReview(x))
    .filter((x) => !q || x.rawMerchant.toLowerCase().includes(q) || (merchants.get(merchantId(flow, x.merchantKey))?.displayName ?? '').toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <select aria-label={t`Month`} value={month} onChange={(e) => setPickedMonth(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
          {[...totals].reverse().map((x) => <option key={x.month} value={x.month}>{formatMonth(x.month, locale)}</option>)}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardHeader><CardTitle className="text-sm font-normal text-muted-foreground"><Trans>This month</Trans></CardTitle></CardHeader><CardContent className="text-2xl font-semibold tabular-nums">{yen(current)}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm font-normal text-muted-foreground"><Trans>Previous month</Trans></CardTitle></CardHeader><CardContent className="text-2xl font-semibold tabular-nums">{previous === undefined ? '—' : yen(previous)}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm font-normal text-muted-foreground"><Trans>Change</Trans></CardTitle></CardHeader><CardContent className="text-2xl font-semibold tabular-nums">{change === undefined ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(1)}%`}</CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle><Trans>By category per month</Trans></CardTitle></CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer>
            <BarChart data={stacked.rows}>
              <CartesianGrid vertical={false} strokeOpacity={0.2} />
              <XAxis dataKey="month" tickFormatter={(m) => formatMonth(m, locale)} />
              <YAxis tickFormatter={yen} width={90} />
              <Tooltip formatter={(v, name) => [yen(Number(v)), i18n._(CATEGORY_LABEL[name as Category])]} labelFormatter={(m) => formatMonth(String(m), locale)} />
              <Legend formatter={(name: string) => i18n._(CATEGORY_LABEL[name as Category])} />
              {series.map((c) => <Bar key={c} dataKey={c} stackId="a" fill={colorOf(c)} stroke="var(--card)" strokeWidth={2} />)}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle><Trans>Categories — {formatMonth(month!, locale)}</Trans></CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {categoryTotals(monthCounted, resolve).map(({ category: c, total }) => (
                <li key={c}>
                  <button type="button" onClick={() => setCategory(category === c ? '' : c)} className="w-full text-left">
                    <div className="flex justify-between text-sm"><span className={category === c ? 'font-semibold' : ''}>{i18n._(CATEGORY_LABEL[c])}</span><span className="tabular-nums">{yen(total)}</span></div>
                    <div className="mt-1 h-2 rounded bg-muted"><div className="h-2 rounded" style={{ width: `${current > 0 ? Math.max(0, (total / current) * 100) : 0}%`, background: colorOf(c) }} /></div>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle><Trans>Top merchants — {formatMonth(month!, locale)}</Trans></CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead><Trans>Merchant</Trans></TableHead><TableHead className="text-right"><Trans>Count</Trans></TableHead><TableHead className="text-right"><Trans>Total</Trans></TableHead><TableHead><Trans>Category</Trans></TableHead></TableRow></TableHeader>
              <TableBody>
                {merchantTotals(monthTxns, merchants).slice(0, 15).map((m) => {
                  const rec = merchants.get(m.id)
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="max-w-48 truncate">{m.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.count}</TableCell>
                      <TableCell className="text-right tabular-nums">{yen(m.total)}</TableCell>
                      <TableCell>
                        {rec ? (
                          <CategorySelect flow={flow} label={t`Category for ${m.name}`} value={rec.overrideCategory ?? rec.aiCategory ?? (flow === 'expense' ? 'other' : 'other_income')} onChange={(c) => db.merchants.update(m.id, { overrideCategory: c, needsReview: false })} />
                        ) : (
                          <span className="text-sm text-muted-foreground"><Trans>Fixed</Trans></span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle><Trans>Transactions — {formatMonth(month!, locale)}</Trans></CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t`Search merchant`} className="max-w-xs" />
            <select aria-label={t`Category filter`} value={category} onChange={(e) => setCategory(e.target.value as Category | '')} className="h-9 rounded-md border bg-background px-2 text-sm">
              <option value=""><Trans>All categories</Trans></option>
              {(flow === 'expense' ? SPENDING : INCOME).map((c) => <option key={c} value={c}>{i18n._(CATEGORY_LABEL[c])}</option>)}
            </select>
            {hasMethod && (
              <select aria-label={t`Payment method`} value={method} onChange={(e) => setMethod(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
                <option value=""><Trans>All methods</Trans></option>
                {methods.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            )}
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={reviewOnly} onChange={(e) => setReviewOnly(e.target.checked)} /><Trans>Needs review only</Trans></label>
          </div>
          <Table>
            <TableHeader><TableRow><TableHead><Trans>Date</Trans></TableHead><TableHead><Trans>Merchant</Trans></TableHead>{hasMethod && <TableHead><Trans>Method</Trans></TableHead>}<TableHead className="text-right"><Trans>Amount</Trans></TableHead><TableHead><Trans>Category</Trans></TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((x) => (
                <TableRow key={x.id}>
                  <TableCell className="tabular-nums">{x.date}</TableCell>
                  <TableCell className="max-w-64 truncate" title={x.rawMerchant}>
                    {merchants.get(merchantId(flow, x.merchantKey))?.displayName ?? x.rawMerchant.normalize('NFKC')}
                    {needsReview(x) && <Badge variant="outline" className="ml-2"><Trans>Review</Trans></Badge>}
                  </TableCell>
                  {hasMethod && <TableCell className="text-sm text-muted-foreground">{x.method}</TableCell>}
                  <TableCell className="text-right tabular-nums">{yen(x.amount)}</TableCell>
                  <TableCell><CategorySelect flow={flow} label={t`Category for this transaction`} value={resolve(x)} onChange={(c) => db.txns.update(x.id, { overrideCategory: c })} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
