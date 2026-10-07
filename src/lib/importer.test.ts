import { beforeEach, expect, test } from 'bun:test'
import { db } from './db'
import { deleteAccount, deleteUpload, importRows } from './importer'
import type { Account, ParsedRow } from './types'

const acct: Account = { id: 'A', type: 'paypay', name: 'PayPay', currency: 'JPY', createdAt: 0 }
const row = (key: string, extra: Partial<ParsedRow> = {}): ParsedRow => ({
  key, date: '2026-09-01', kind: 'expense', amount: 100, rawMerchant: 'Shop - 1', merchantKey: 'SHOP', ...extra,
})

beforeEach(async () => {
  await db.delete()
  await db.open()
})

test('imports rows and creates pending merchants only for AI-categorized rows', async () => {
  const u = await importRows(acct, 'f.csv', [
    row('1'),
    row('2', { kind: 'income', fixedCategory: 'cashback_points' }),
    row('3', { kind: 'transfer' }),
  ])
  expect([u.added, u.skipped]).toEqual([3, 0])
  const t = await db.txns.get('A:1')
  expect(t?.month).toBe('2026-09')
  expect(t?.uploadId).toBe(u.id)
  expect(await db.merchants.toArray()).toEqual([
    { id: 'expense|SHOP', kind: 'expense', merchantKey: 'SHOP', displayName: 'Shop - 1', needsReview: false },
  ])
})

test('re-importing overlapping rows skips duplicates, including duplicates within one file', async () => {
  await importRows(acct, 'a.csv', [row('1'), row('2')])
  const u = await importRows(acct, 'b.csv', [row('2'), row('3'), row('3')])
  expect([u.added, u.skipped]).toEqual([1, 2])
  expect(await db.txns.count()).toBe(3)
})

test('existing merchant (with AI category) is not reset by a new import', async () => {
  await importRows(acct, 'a.csv', [row('1')])
  await db.merchants.update('expense|SHOP', { aiCategory: 'groceries' })
  await importRows(acct, 'b.csv', [row('9')])
  expect((await db.merchants.get('expense|SHOP'))?.aiCategory).toBe('groceries')
})

test('same key in another account is not a duplicate', async () => {
  await importRows(acct, 'a.csv', [row('1')])
  const u = await importRows({ ...acct, id: 'B' }, 'a.csv', [row('1')])
  expect(u.added).toBe(1)
})

test('deleteUpload removes only that upload’s rows', async () => {
  const a = await importRows(acct, 'a.csv', [row('1')])
  await importRows(acct, 'b.csv', [row('2')])
  await deleteUpload(a.id)
  expect((await db.txns.toArray()).map((t) => t.key)).toEqual(['2'])
  expect(await db.uploads.count()).toBe(1)
})

test('deleteAccount removes account, uploads, txns', async () => {
  await db.accounts.add(acct)
  await importRows(acct, 'a.csv', [row('1')])
  await deleteAccount('A')
  expect([await db.accounts.count(), await db.uploads.count(), await db.txns.count()]).toEqual([0, 0, 0])
})

test('new merchant display name is NFKC-normalized raw text', async () => {
  await importRows(acct, 'f.csv', [row('1', { rawMerchant: 'ＡＭＡＺＯＮ．Ｃ', merchantKey: 'AMAZON.C' })])
  expect((await db.merchants.get('expense|AMAZON.C'))?.displayName).toBe('AMAZON.C')
})
