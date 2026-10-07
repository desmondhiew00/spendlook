import { expect, test } from 'bun:test'
import { byCategoryMonth, categoryTotals, merchantTotals, monthlyTotals, monthOptions, previousMonth, resolveCategory, topCategories } from './aggregate'
import type { Category, Merchant, Txn } from './types'

const tx = (id: string, month: string, amount: number, extra: Partial<Txn> = {}): Txn => ({
  id, key: id, accountId: 'A', uploadId: 'u', month, date: `${month}-01`, kind: 'expense', amount,
  rawMerchant: 'Shop', merchantKey: 'SHOP', ...extra,
})
const m: Merchant = { id: 'expense|SHOP', kind: 'expense', merchantKey: 'SHOP', displayName: 'Shop', aiCategory: 'groceries', needsReview: false }
const merchants = new Map([[m.id, m]])

test('resolution order: txn override > fixed > merchant override > AI > other', () => {
  expect(resolveCategory(tx('1', '2026-09', 1), merchants)).toBe('groceries')
  expect(resolveCategory(tx('1', '2026-09', 1), new Map([[m.id, { ...m, overrideCategory: 'dining' as const }]]))).toBe('dining')
  expect(resolveCategory(tx('1', '2026-09', 1, { fixedCategory: 'paypay' }), merchants)).toBe('paypay')
  expect(resolveCategory(tx('1', '2026-09', 1, { fixedCategory: 'paypay', overrideCategory: 'travel' }), merchants)).toBe('travel')
  expect(resolveCategory(tx('1', '2026-09', 1, { merchantKey: 'NEW' }), merchants)).toBe('other')
  expect(resolveCategory(tx('1', '2026-09', 1, { kind: 'income', merchantKey: 'NEW' }), merchants)).toBe('other_income')
})

test('refund in a later month nets that month, can go negative', () => {
  const txns = [tx('1', '2026-07', 10560), tx('2', '2026-08', -10560), tx('3', '2026-08', 500)]
  expect(monthlyTotals(txns)).toEqual([
    { month: '2026-07', total: 10560 },
    { month: '2026-08', total: -10060 },
  ])
})

test('byCategoryMonth builds stacked rows', () => {
  const r = (t: Txn): Category => (t.merchantKey === 'SHOP' ? 'groceries' : 'dining')
  const out = byCategoryMonth([tx('1', '2026-08', 100), tx('2', '2026-07', 50, { merchantKey: 'X' }), tx('3', '2026-08', 25)], r)
  expect(out.rows).toEqual([{ month: '2026-07', dining: 50 }, { month: '2026-08', groceries: 125 }])
  expect(out.categories.sort()).toEqual(['dining', 'groceries'])
})

test('categoryTotals and merchantTotals sort descending', () => {
  const txns = [tx('1', '2026-08', 100), tx('2', '2026-08', 300, { merchantKey: 'BIG', rawMerchant: 'Big' }), tx('3', '2026-08', 50)]
  expect(categoryTotals(txns, () => 'other')).toEqual([{ category: 'other', total: 450 }])
  expect(merchantTotals(txns, merchants)).toEqual([
    { id: 'expense|BIG', name: 'Big', total: 300, count: 1 },
    { id: 'expense|SHOP', name: 'Shop', total: 150, count: 2 },
  ])
})

test('topCategories: largest n by total, fold bucket never takes a slot, returned in fixed list order', () => {
  const by: Record<string, Category> = { a: 'travel', b: 'dining', c: 'other', d: 'rent', e: 'groceries' }
  const txns = [tx('a', '2026-08', 900), tx('b', '2026-08', 500), tx('c', '2026-08', 9999), tx('d', '2026-07', 300), tx('e', '2026-08', 100)]
  const resolve = (t: Txn) => by[t.id]
  // fixed SPENDING order: groceries, dining, transport, rent, ..., travel
  expect(topCategories(txns, resolve, 3, 'other')).toEqual(['dining', 'rent', 'travel'])
})

test('merchantTotals falls back to a half-width display name for merchants without a record', () => {
  const [row] = merchantTotals([tx('1', '2026-08', 100, { merchantKey: 'RTK ペイペイ', rawMerchant: 'ＲＴＫ　ペイペイ' })], merchants)
  expect(row.name).toBe('RTK ペイペイ')
})

test('monthOptions lists every month that has rows, even fully excluded ones, ascending', () => {
  const all = [tx('1', '2026-09', 10), tx('2', '2026-07', 5), tx('3', '2026-09', 1)]
  expect(monthOptions(all)).toEqual(['2026-07', '2026-09'])
})

test('previousMonth is the calendar month before, across year boundaries', () => {
  expect(previousMonth('2026-03')).toBe('2026-02')
  expect(previousMonth('2026-01')).toBe('2025-12')
})
