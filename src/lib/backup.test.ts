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
  const json = await exportBackup()
  await db.delete()
  await db.open()
  await db.accounts.add({ id: 'B', type: 'paypay', name: 'PP', currency: 'JPY', createdAt: 2 })
  await importBackup(json)
  expect((await db.accounts.toArray()).map((a) => a.id).sort()).toEqual(['A', 'B'])
  expect((await db.merchants.get('expense|X'))?.overrideCategory).toBe('rent')
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
