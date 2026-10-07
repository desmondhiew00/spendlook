import { beforeEach, expect, test } from 'bun:test'
import { type AiResult, type Generate, applyResult, categorizePending, recategorizeAll } from './categorize'
import { db } from './db'
import type { Merchant } from './types'

const merchant = (key: string, kind: Merchant['kind'] = 'expense'): Merchant => ({
  id: `${kind}|${key}`, kind, merchantKey: key, displayName: key.toLowerCase(), needsReview: false,
})
const ok = (id: string, category: AiResult['category'], confidence = 0.9): AiResult => ({ id, display_name: `Nice ${id}`, category, confidence })

// merchants plus one transaction each, so they are not orphans
async function seed(ms: Merchant[]) {
  await db.merchants.bulkAdd(ms)
  await db.txns.bulkAdd(ms.map((m, i) => ({ id: `A:${i}`, key: String(i), accountId: 'A', uploadId: 'u', date: '2026-09-01', month: '2026-09', kind: m.kind, amount: 1, rawMerchant: m.displayName, merchantKey: m.merchantKey })))
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

test('applyResult: valid, invalid-for-kind, low confidence, missing', () => {
  expect(applyResult(merchant('A'), ok('x', 'dining'))).toMatchObject({ aiCategory: 'dining', displayName: 'Nice x', needsReview: false })
  expect(applyResult(merchant('A'), ok('x', 'salary'))).toMatchObject({ aiCategory: 'other', needsReview: true })
  expect(applyResult(merchant('A', 'income'), ok('x', 'dining'))).toMatchObject({ aiCategory: 'other_income', needsReview: true })
  expect(applyResult(merchant('A'), ok('x', 'dining', 0.3))).toMatchObject({ aiCategory: 'dining', needsReview: true })
  const missing = applyResult(merchant('A'), undefined)
  expect(missing.aiCategory).toBeUndefined()
  expect(missing.needsReview).toBe(true)
})

test('categorizePending sends only uncategorized merchants, in batches, names not keys', async () => {
  await seed([merchant('A'), merchant('B'), merchant('C'), { ...merchant('D'), aiCategory: 'rent' }])
  const calls: string[][] = []
  const gen: Generate = async (items) => {
    calls.push(items.map((i) => i.name))
    return items.map((i) => ok(i.id, 'shopping'))
  }
  const progress: number[][] = []
  expect(await categorizePending(gen, 2, (p, t) => progress.push([p, t]))).toEqual({ done: 3, failed: 0 })
  expect(progress).toEqual([[0, 3], [2, 3], [3, 3]])
  expect(calls).toEqual([['a', 'b'], ['c']])
  expect((await db.merchants.get('expense|A'))?.aiCategory).toBe('shopping')
})

test('a failing batch is flagged and retried on the next run', async () => {
  await seed([merchant('A'), merchant('B')])
  let fail = true
  const gen: Generate = async (items) => {
    if (fail) throw new Error('401')
    return items.map((i) => ok(i.id, 'dining'))
  }
  expect(await categorizePending(gen)).toEqual({ done: 0, failed: 2 })
  expect((await db.merchants.get('expense|A'))?.needsReview).toBe(true)
  fail = false
  expect(await categorizePending(gen)).toEqual({ done: 2, failed: 0 })
  expect((await db.merchants.get('expense|A'))?.needsReview).toBe(false)
})

test('merchant missing from the AI response stays pending', async () => {
  await seed([merchant('A'), merchant('B')])
  await categorizePending(async () => [ok('expense|A', 'dining')])
  expect((await db.merchants.get('expense|B'))?.aiCategory).toBeUndefined()
  expect((await db.merchants.get('expense|B'))?.needsReview).toBe(true)
})

test('orphan merchants (their transactions were deleted) are never sent to the AI', async () => {
  await db.merchants.bulkAdd([merchant('LIVE'), merchant('GONE')])
  await db.txns.add({ id: 'A:1', key: '1', accountId: 'A', uploadId: 'u', date: '2026-09-01', month: '2026-09', kind: 'expense', amount: 1, rawMerchant: 'live', merchantKey: 'LIVE' })
  const sent: string[] = []
  await categorizePending(async (items) => { sent.push(...items.map((i) => i.id)); return [] })
  expect(sent).toEqual(['expense|LIVE'])
})

test('recategorizeAll re-runs AI-owned merchants, never user-picked ones, and sends the user rename', async () => {
  await seed([merchant('A'), merchant('B'), merchant('C')])
  await db.merchants.update('expense|A', { aiCategory: 'other' })
  await db.merchants.update('expense|B', { aiCategory: 'other', overrideCategory: 'rent' })
  await db.merchants.update('expense|C', { aiCategory: 'other', overrideName: 'My gym' })
  const sent: string[] = []
  const r = await recategorizeAll(async (items) => {
    sent.push(...items.map((i) => i.name))
    return items.map((i) => ok(i.id, 'insurance'))
  })
  expect(r).toEqual({ done: 2, failed: 0 })
  expect(sent).toEqual(['a', 'My gym'])
  expect((await db.merchants.get('expense|A'))?.aiCategory).toBe('insurance')
  expect(await db.merchants.get('expense|B')).toMatchObject({ aiCategory: 'other', overrideCategory: 'rent' })
  expect((await db.merchants.get('expense|C'))?.overrideName).toBe('My gym')
})

test('recategorizeAll keeps the previous category when a batch fails', async () => {
  await seed([merchant('A')])
  await db.merchants.update('expense|A', { aiCategory: 'dining' })
  expect(await recategorizeAll(async () => { throw new Error('429') })).toEqual({ done: 0, failed: 1 })
  expect(await db.merchants.get('expense|A')).toMatchObject({ aiCategory: 'dining', needsReview: true })
})
