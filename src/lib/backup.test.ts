import { beforeEach, expect, test } from 'bun:test'
import { deleteAllData, exportBackup, importBackup } from './backup'
import { db } from './db'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

test('round-trips all tables and merges into existing data', async () => {
  await db.accounts.add({ id: 'A', type: 'mufg', name: 'Main', currency: 'JPY', createdAt: 1 })
  await db.merchants.add({ id: 'expense|X', kind: 'expense', merchantKey: 'X', displayName: 'X', overrideCategory: 'rent', needsReview: false })
  await db.txns.add({ id: 'A:1', key: '1', accountId: 'A', uploadId: 'U', month: '2026-01', date: '2026-01-02', kind: 'expense', amount: 500, rawMerchant: 'X', merchantKey: 'X', note: 'team lunch' })
  const json = await exportBackup()
  await db.delete()
  await db.open()
  await db.accounts.add({ id: 'B', type: 'paypay', name: 'PP', currency: 'JPY', createdAt: 2 })
  await importBackup(json)
  expect((await db.accounts.toArray()).map((a) => a.id).sort()).toEqual(['A', 'B'])
  expect((await db.merchants.get('expense|X'))?.overrideCategory).toBe('rent')
  expect((await db.txns.get('A:1'))?.note).toBe('team lunch')
})

test('rejects foreign JSON without writing', async () => {
  await expect(importBackup('{"hello":1}')).rejects.toThrow('Not a spendlook backup')
  expect(await db.accounts.count()).toBe(0)
})

test('deleteAllData empties every table', async () => {
  await db.accounts.add({ id: 'A', type: 'mufg', name: 'Main', currency: 'JPY', createdAt: 1 })
  await db.merchants.add({ id: 'expense|X', kind: 'expense', merchantKey: 'X', displayName: 'X', needsReview: false })
  await db.usage.add({ id: 'u', at: 1, provider: 'anthropic', model: 'm', job: 'test', items: 0, ok: true, inputTokens: 1, outputTokens: 1 })
  await deleteAllData()
  const counts = await Promise.all(db.tables.map((t) => t.count()))
  expect(counts.every((n) => n === 0)).toBe(true)
  expect(db.tables.length).toBeGreaterThanOrEqual(5)
})

test('restores custom categories; an id with no category falls back to Other', async () => {
  await db.categories.add({ id: 'c_coffee', flow: 'expense', name: 'Coffee', createdAt: 1 })
  await db.merchants.bulkAdd([
    { id: 'expense|A', kind: 'expense', merchantKey: 'A', displayName: 'A', aiCategory: 'c_coffee', needsReview: false },
    { id: 'income|B', kind: 'income', merchantKey: 'B', displayName: 'B', overrideCategory: 'c_gone', needsReview: false },
  ])
  const json = await exportBackup()
  await db.delete()
  await db.open()
  await importBackup(json)
  expect((await db.categories.get('c_coffee'))?.name).toBe('Coffee')
  expect((await db.merchants.get('expense|A'))?.aiCategory).toBe('c_coffee')
  expect((await db.merchants.get('income|B'))?.overrideCategory).toBe('other_income')
})
