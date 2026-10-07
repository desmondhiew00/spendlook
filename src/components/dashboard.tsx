import { Plural, Trans, useLingui } from '@lingui/react/macro'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, CircleAlert, Pencil } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { CATEGORY_LABEL, FOLD_COLOR, SERIES_COLORS } from '@/components/category-label'
import { CategorySelect } from '@/components/category-select'
import { Picker } from '@/components/picker'
import { SortHead, useSort } from '@/components/sort-head'
import { StackedBarChart } from '@/components/stacked-bar-chart'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableFooter, TableHeader, TableRow } from '@/components/ui/table'
import { byCategoryMonth, categoryTotals, merchantTotals, monthOptions, monthlyTotals, previousMonth, resolveCategory, topCategories } from '@/lib/aggregate'
import { db } from '@/lib/db'
import { formatMoney, formatMonth } from '@/lib/format'
import { sortRows } from '@/lib/sort'
import { type Category, type Flow, INCOME, SPENDING, type Txn, merchantId, merchantName } from '@/lib/types'

export function Dashboard({ accountId, currency, flow, month: wantedMonth, onMonthChange: setPickedMonth, hasMethod }: { accountId: string; currency: string; flow: Flow; month?: string; onMonthChange: (month: string) => void; hasMethod: boolean }) {
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
  const months = useMemo(() => monthOptions(txns), [txns])
  const totalByMonth = useMemo(() => new Map(monthlyTotals(counted).map((x) => [x.month, x.total])), [counted])
  // a URL month with no data in this tab (or a stale link) falls back to the latest month
  const month = wantedMonth && months.includes(wantedMonth) ? wantedMonth : months.at(-1)
  const monthStrip = useRef<HTMLDivElement>(null)
  // keep the selected chip centred in the strip without scrolling the page
  useEffect(() => {
    const strip = monthStrip.current
    const chip = strip?.querySelector<HTMLElement>('[aria-pressed=true]')
    if (strip && chip) strip.scrollTo({ left: chip.offsetLeft - strip.offsetLeft - (strip.clientWidth - chip.clientWidth) / 2, behavior: 'smooth' })
  }, [month, months.length])
  const [category, setCategory] = useState<Category | ''>('')
  const [search, setSearch] = useState('')
  const [method, setMethod] = useState('')
  const [reviewOnly, setReviewOnly] = useState(false)
  const [txSort, onTxSort, setTxSort] = useSort<'date' | 'merchant' | 'method' | 'amount' | 'category'>('date')
  const [mSort, onMSort] = useSort<'name' | 'count' | 'total' | 'category'>('total')

  if (!allTxns || !merchantList) return null
  if (!txns.length) return <p className="text-sm text-muted-foreground"><Trans>No transactions yet. Upload a CSV above.</Trans></p>

  const current = totalByMonth.get(month!) ?? 0
  // the other tab's total for the same month, so income and spending can be compared at a glance
  const otherFlow: Flow = flow === 'expense' ? 'income' : 'expense'
  const otherTotal = allTxns.filter((x) => x.kind === otherFlow && x.month === month && resolve(x) !== 'excluded').reduce((sum, x) => sum + x.amount, 0)
  const monthIdx = months.indexOf(month!)
  // calendar month before; undefined only before the first month with data
  const prev = previousMonth(month!)
  const previous = prev >= months[0] ? (totalByMonth.get(prev) ?? 0) : undefined
  const change = previous ? ((current - previous) / Math.abs(previous)) * 100 : undefined
  // spending up is bad, income up is good
  const good = change !== undefined && change !== 0 && (flow === 'expense' ? change < 0 : change > 0)
  const trend = !change ? '' : good ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
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
  const nameOf = (x: Txn) => merchantName(merchants.get(merchantId(flow, x.merchantKey)), x.rawMerchant)
  // fixed-category rows have no merchant record, so nothing to rename; blank clears back to the AI name
  // a rename means the user looked at this merchant, so it also clears the review flag
  const renamer = (id: string) => (merchants.has(id) ? (name: string) => db.merchants.update(id, { overrideName: name || undefined, needsReview: false }) : undefined)
  const txKey = { date: (x: Txn) => x.date, merchant: nameOf, method: (x: Txn) => x.method ?? '', amount: (x: Txn) => x.amount, category: (x: Txn) => i18n._(CATEGORY_LABEL[resolve(x)]) }[txSort.key]
  const merchantCategory = (id: string) => {
    const rec = merchants.get(id)
    return rec ? (rec.overrideCategory ?? rec.aiCategory ?? fold) : undefined
  }
  type MerchantRow = ReturnType<typeof merchantTotals>[number]
  const mKey = { name: (m: MerchantRow) => m.name, count: (m: MerchantRow) => m.count, total: (m: MerchantRow) => m.total, category: (m: MerchantRow) => { const c = merchantCategory(m.id); return c ? i18n._(CATEGORY_LABEL[c]) : '' } }[mSort.key]
  const topMerchants = sortRows(merchantTotals(monthTxns, merchants).slice(0, 15), mKey, mSort.desc, locale)
  const rows = monthTxns
    .filter((x) => !category || resolve(x) === category)
    .filter((x) => !method || x.method === method)
    .filter((x) => !reviewOnly || needsReview(x))
    .filter((x) => !q || x.rawMerchant.toLowerCase().includes(q) || nameOf(x).toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date))
  const sortedRows = sortRows(rows, txKey, txSort.desc, locale)
  const reviewCount = monthTxns.filter(needsReview).length
  const shownCounted = rows.filter((x) => resolve(x) !== 'excluded')
  const shownTotal = shownCounted.reduce((sum, x) => sum + x.amount, 0)
  const shownExcluded = rows.length - shownCounted.length
  const summary = <><Plural value={rows.length} one="# transaction" other="# transactions" />{shownExcluded > 0 && <> · <Trans>{shownExcluded} excluded from total</Trans></>}</>

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon-lg" aria-label={t`Previous month`} disabled={monthIdx <= 0} onClick={() => setPickedMonth(months[monthIdx - 1])}><ChevronLeft /></Button>
        <div ref={monthStrip} role="group" aria-label={t`Month`} className="relative flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
          {months.map((m) => (
            <button key={m} type="button" aria-pressed={m === month} onClick={() => setPickedMonth(m)} className={`shrink-0 cursor-pointer border px-3 py-1.5 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${m === month ? 'border-primary bg-primary/10' : 'bg-card hover:bg-accent'}`}>
              <div className={`kicker ${m === month ? 'text-primary' : 'text-muted-foreground'}`}>{formatMonth(m, locale)}</div>
              <div className="text-sm font-semibold tabular-nums">{yen(totalByMonth.get(m) ?? 0)}</div>
            </button>
          ))}
        </div>
        <Button variant="outline" size="icon-lg" aria-label={t`Next month`} disabled={monthIdx >= months.length - 1} onClick={() => setPickedMonth(months[monthIdx + 1])}><ChevronRight /></Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        {/* the selected month is the headline; comparison cards stay quiet */}
        <Card className="border-primary/60 bg-primary/5">
          <CardHeader><CardTitle><Trans>This month</Trans> · {formatMonth(month!, locale)}</CardTitle></CardHeader>
          <CardContent>
            <div className="text-5xl font-bold tracking-tight tabular-nums">{yen(current)}</div>
            <div className="mt-2 text-sm text-muted-foreground">
              {flow === 'expense' ? <Trans>Income</Trans> : <Trans>Spending</Trans>} <span className="font-medium text-foreground tabular-nums">{yen(otherTotal)}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-muted-foreground"><Trans>Previous month</Trans> · {formatMonth(prev, locale)}</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tracking-tight text-muted-foreground tabular-nums">{previous === undefined ? '—' : yen(previous)}</div>
            {change !== undefined && (
              <div className={`mt-2 flex items-center gap-1 text-sm font-semibold tabular-nums ${trend || 'text-muted-foreground'}`}>
                {change > 0 ? <ArrowUpRight className="size-4" aria-hidden="true" /> : change < 0 ? <ArrowDownRight className="size-4" aria-hidden="true" /> : null}
                {`${change > 0 ? '+' : ''}${change.toFixed(1)}%`}
                <span className="font-normal text-muted-foreground"><Trans>this month</Trans></span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle><Trans>By category per month</Trans></CardTitle></CardHeader>
        <CardContent className="h-80">
          <StackedBarChart
            x={stacked.rows.map((r) => r.month)}
            series={series.map((c) => ({ key: c, name: i18n._(CATEGORY_LABEL[c]), color: colorOf(c), data: stacked.rows.map((r) => Number(r[c] ?? 0)) }))}
            selected={month}
            formatX={(m) => formatMonth(m, locale)}
            formatValue={yen}
            onPick={setPickedMonth}
            totalLabel={t`Total`}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
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

        {/* tables run edge to edge; outer cells keep the card's 16px inset so text lines up with the title */}
        <Card className="pb-0">
          <CardHeader><CardTitle><Trans>Top merchants — {formatMonth(month!, locale)}</Trans></CardTitle></CardHeader>
          <CardContent className="px-0">
            <Table className="[&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
              <TableHeader>
                <TableRow>
                  <SortHead k="name" sort={mSort} onSort={onMSort}><Trans>Merchant</Trans></SortHead>
                  <SortHead k="category" sort={mSort} onSort={onMSort}><Trans>Category</Trans></SortHead>
                  <SortHead k="count" sort={mSort} onSort={onMSort} firstDesc right><Trans>Count</Trans></SortHead>
                  <SortHead k="total" sort={mSort} onSort={onMSort} firstDesc right><Trans>Total</Trans></SortHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topMerchants.map((m) => {
                  const rec = merchants.get(m.id)
                  const c = merchantCategory(m.id)
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="max-w-48"><MerchantName name={m.name} raw={m.raw} onRename={renamer(m.id)} /></TableCell>
                      <TableCell>
                        {rec && c ? (
                          <CategorySelect flow={flow} label={t`Category for ${m.name}`} value={c} onChange={(c) => db.merchants.update(m.id, { overrideCategory: c, needsReview: false })} />
                        ) : (
                          <span className="text-sm text-muted-foreground"><Trans>Fixed</Trans></span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{m.count}</TableCell>
                      <TableCell className="text-right tabular-nums">{yen(m.total)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="pb-0">
        <CardHeader><CardTitle><Trans>Transactions — {formatMonth(month!, locale)}</Trans></CardTitle></CardHeader>
        <CardContent className="space-y-3 px-0">
          <div className="flex flex-wrap items-center gap-2 px-4">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t`Search merchant`} className="max-w-xs" />
            <Picker<Category | ''> label={t`Category filter`} value={category} onChange={setCategory} className="h-9" options={[{ value: '', label: t`All categories` }, ...(flow === 'expense' ? SPENDING : INCOME).map((c) => ({ value: c, label: i18n._(CATEGORY_LABEL[c]) }))]} />
            {hasMethod && (
              <Picker label={t`Payment method`} value={method} onChange={setMethod} className="h-9" options={[{ value: '', label: t`All methods` }, ...methods.map((m) => ({ value: m, label: m }))]} />
            )}
            <Label className="cursor-pointer font-normal"><Checkbox checked={reviewOnly} onCheckedChange={setReviewOnly} /><Trans>Needs review only</Trans>{reviewCount > 0 && <ReviewBadge count={reviewCount} />}</Label>
          </div>
          {/* phones: stacked rows with a sort picker instead of a wide table */}
          <div className="flex items-center gap-2 px-4 sm:hidden">
            <Picker
              label={t`Sort by`}
              value={`${txSort.key}:${txSort.desc ? 'desc' : 'asc'}`}
              onChange={(v) => { const [key, dir] = v.split(':'); setTxSort({ key: key as typeof txSort.key, desc: dir === 'desc' }) }}
              className="h-9"
              options={[
                { value: 'date:desc', label: t`Newest first` },
                { value: 'date:asc', label: t`Oldest first` },
                { value: 'amount:desc', label: t`Highest amount` },
                { value: 'amount:asc', label: t`Lowest amount` },
                { value: 'merchant:asc', label: t`Merchant A→Z` },
              ]}
            />
          </div>
          <ul className="divide-y border-t sm:hidden">
            {sortedRows.map((x) => (
              <li key={x.id} className={`space-y-2 px-4 py-3 ${needsReview(x) ? 'bg-amber-500/5 shadow-[inset_2px_0_0_var(--color-amber-500)]' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <MerchantName name={nameOf(x)} raw={x.rawMerchant.normalize('NFKC')} onRename={renamer(merchantId(flow, x.merchantKey))} />
                    <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">{x.date}{hasMethod && x.method ? ` · ${x.method}` : ''}</div>
                  </div>
                  <div className="shrink-0 font-semibold tabular-nums">{yen(x.amount)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <CategorySelect flow={flow} label={t`Category for this transaction`} value={resolve(x)} onChange={(c) => db.txns.update(x.id, { overrideCategory: c })} />
                  {needsReview(x) && <ReviewBadge />}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex justify-between gap-3 border-t bg-muted/50 px-4 py-3 text-sm sm:hidden">
            <span className="text-muted-foreground">{summary}</span>
            <span className="font-semibold tabular-nums">{yen(shownTotal)}</span>
          </div>
          <div className="hidden sm:block">
            <Table className="[&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
              <TableHeader>
                <TableRow>
                  <SortHead k="date" sort={txSort} onSort={onTxSort} firstDesc><Trans>Date</Trans></SortHead>
                  <SortHead k="merchant" sort={txSort} onSort={onTxSort}><Trans>Merchant</Trans></SortHead>
                  {hasMethod && <SortHead k="method" sort={txSort} onSort={onTxSort}><Trans>Method</Trans></SortHead>}
                  <SortHead k="category" sort={txSort} onSort={onTxSort}><Trans>Category</Trans></SortHead>
                  <SortHead k="amount" sort={txSort} onSort={onTxSort} firstDesc right><Trans>Amount</Trans></SortHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.map((x) => (
                  <TableRow key={x.id} className={needsReview(x) ? 'bg-amber-500/5 shadow-[inset_2px_0_0_var(--color-amber-500)] hover:bg-amber-500/10' : undefined}>
                    <TableCell className="tabular-nums">{x.date}</TableCell>
                    <TableCell className="max-w-72">
                      <MerchantName name={nameOf(x)} raw={x.rawMerchant.normalize('NFKC')} onRename={renamer(merchantId(flow, x.merchantKey))}>
                        {needsReview(x) && <ReviewBadge />}
                      </MerchantName>
                    </TableCell>
                    {hasMethod && <TableCell className="text-sm text-muted-foreground">{x.method}</TableCell>}
                    <TableCell><CategorySelect flow={flow} label={t`Category for this transaction`} value={resolve(x)} onChange={(c) => db.txns.update(x.id, { overrideCategory: c })} /></TableCell>
                    <TableCell className="text-right tabular-nums">{yen(x.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={hasMethod ? 4 : 3} className="text-muted-foreground">{summary}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{yen(shownTotal)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// AI display name first; the bank's original description underneath so a wrong cleanup is visible.
// Renaming applies to the merchant, so every transaction from it follows.
function MerchantName({ name, raw, onRename, children }: { name: string; raw: string; onRename?: (name: string) => void; children?: ReactNode }) {
  const { t } = useLingui()
  const [editing, setEditing] = useState(false)
  const save = (v: string) => {
    setEditing(false)
    if (v.trim() !== name) onRename?.(v.trim())
  }
  return (
    <div className="min-w-0">
      {editing ? (
        <Input
          autoFocus
          defaultValue={name}
          placeholder={raw}
          aria-label={t`Merchant name`}
          className="h-7 min-w-40"
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') { e.currentTarget.value = name; e.currentTarget.blur() }
          }}
          onBlur={(e) => save(e.currentTarget.value)}
        />
      ) : (
        <div className="group/name flex items-center gap-1">
          <span className="truncate">{name}</span>
          {onRename && (
            <Button variant="ghost" size="icon-xs" aria-label={t`Rename ${name}`} title={t`Rename (applies to all its transactions)`} onClick={() => setEditing(true)} className="text-muted-foreground opacity-60 hover:opacity-100 group-hover/name:opacity-100">
              <Pencil />
            </Button>
          )}
          {children}
        </div>
      )}
      {raw !== name && <div className="truncate text-xs text-muted-foreground" title={raw}>{raw}</div>}
    </div>
  )
}

// amber = "AI unsure, please check"; distinct from the yellow brand accent and from red errors
function ReviewBadge({ count }: { count?: number }) {
  return (
    <Badge className="gap-1 border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300">
      <CircleAlert aria-hidden="true" />
      {count ?? <Trans>Review</Trans>}
    </Badge>
  )
}
