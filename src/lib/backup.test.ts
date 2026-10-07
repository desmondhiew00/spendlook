import { beforeEach, expect, test } from 'bun:test'
import { exportBackup, importBackup } from './backup'
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
