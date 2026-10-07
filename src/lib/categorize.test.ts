import { beforeEach, expect, test } from 'bun:test'
import { type AiResult, type Generate, applyResult, categorizePending } from './categorize'
import { db } from './db'
import type { Merchant } from './types'

const merchant = (key: string, kind: Merchant['kind'] = 'expense'): Merchant => ({
  id: `${kind}|${key}`, kind, merchantKey: key, displayName: key.toLowerCase(), needsReview: false,
})
const ok = (id: string, category: AiResult['category'], confidence = 0.9): AiResult => ({ id, display_name: `Nice ${id}`, category, confidence })

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
  await db.merchants.bulkAdd([merchant('A'), merchant('B'), merchant('C'), { ...merchant('D'), aiCategory: 'rent' }])
  const calls: string[][] = []
  const gen: Generate = async (items) => {
    calls.push(items.map((i) => i.name))
    return items.map((i) => ok(i.id, 'shopping'))
  }
  expect(await categorizePending(gen, 2)).toEqual({ done: 3, failed: 0 })
  expect(calls).toEqual([['a', 'b'], ['c']])
  expect((await db.merchants.get('expense|A'))?.aiCategory).toBe('shopping')
})

test('a failing batch is flagged and retried on the next run', async () => {
  await db.merchants.bulkAdd([merchant('A'), merchant('B')])
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
  await db.merchants.bulkAdd([merchant('A'), merchant('B')])
  await categorizePending(async () => [ok('expense|A', 'dining')])
  expect((await db.merchants.get('expense|B'))?.aiCategory).toBeUndefined()
  expect((await db.merchants.get('expense|B'))?.needsReview).toBe(true)
})
