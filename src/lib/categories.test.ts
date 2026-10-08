import { beforeEach, expect, test } from 'bun:test'
import { addCategory, aiCategories, categoryOrder, categoryUsage, deleteCategory, nameProblem, pickable, updateCategory } from './categories'
import { db } from './db'
import type { CategoryDef } from './types'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

const defs: CategoryDef[] = [
  { id: 'c_b', flow: 'expense', name: 'Pets', createdAt: 2 },
  { id: 'c_a', flow: 'expense', name: 'Coffee', hint: 'cafes', createdAt: 1 },
  { id: 'c_i', flow: 'income', name: 'Rental', createdAt: 3 },
  { id: 'car', flow: 'expense', hidden: true, createdAt: 4 },
]

test('custom categories sit before the fold bucket, in creation order', () => {
  expect(categoryOrder('expense', defs).slice(-5)).toEqual(['cash_withdrawal', 'c_a', 'c_b', 'other', 'excluded'])
  expect(categoryOrder('income', defs).slice(-3)).toEqual(['c_i', 'other_income', 'excluded'])
})

test('hidden categories leave pickers and the AI, but stay for a row that has them', () => {
  expect(pickable('expense', defs)).not.toContain('car')
  expect(pickable('expense', defs, 'car')).toContain('car')
  const ai = aiCategories(defs)
  expect(ai.expense).not.toContain('car')
  expect(ai.expense.slice(-2)).toEqual(['c_a', 'c_b'])
  expect(ai.income.at(-1)).toBe('c_i')
  expect(ai.custom.map((d) => d.id)).toEqual(['c_a', 'c_b', 'c_i'])
})

test('nameProblem', () => {
  expect(nameProblem('  ', [])).toBe('empty')
  expect(nameProblem('x'.repeat(41), [])).toBe('long')
  expect(nameProblem(' dining ', ['Dining'])).toBe('taken')
  expect(nameProblem('Coffee', ['Dining'])).toBeNull()
})

test('built-ins in LOCKED cannot be hidden; others get a row on first change', async () => {
  await expect(updateCategory('other', 'expense', { hidden: true })).rejects.toThrow()
  await updateCategory('car', 'expense', { hidden: true })
  await updateCategory('car', 'expense', { name: 'Vehicle' })
  expect(await db.categories.get('car')).toMatchObject({ hidden: true, name: 'Vehicle' })
})

test('deleteCategory moves its rows to Other and flags AI picks for review', async () => {
  const id = await addCategory('expense', ' Coffee ', 'cafes')
  expect((await db.categories.get(id))?.name).toBe('Coffee')
  await db.merchants.bulkAdd([
    { id: 'expense|A', kind: 'expense', merchantKey: 'A', displayName: 'A', aiCategory: id, needsReview: false },
    { id: 'expense|B', kind: 'expense', merchantKey: 'B', displayName: 'B', aiCategory: 'dining', overrideCategory: id, needsReview: false },
  ])
  await db.txns.add({ id: 'X:1', key: '1', accountId: 'X', uploadId: 'u', date: '2026-09-01', month: '2026-09', kind: 'expense', amount: 1, rawMerchant: 'A', merchantKey: 'A', overrideCategory: id })
  expect(await categoryUsage(id)).toEqual({ txns: 1, merchants: 2 })
  await deleteCategory(id)
  expect(await db.categories.get(id)).toBeUndefined()
  expect(await db.merchants.get('expense|A')).toMatchObject({ aiCategory: 'other', needsReview: true })
  expect(await db.merchants.get('expense|B')).toMatchObject({ aiCategory: 'dining', overrideCategory: 'other', needsReview: false })
  expect((await db.txns.get('X:1'))?.overrideCategory).toBe('other')
})
