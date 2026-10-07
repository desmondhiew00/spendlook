import { expect, test } from 'bun:test'
import type { AiUsage } from './types'
import { costOf, estimate, summarize } from './usage'

const u = (model: string, inputTokens: number, outputTokens: number, items = 10): AiUsage =>
  ({ id: model + inputTokens, at: 0, provider: 'x', model, job: 'categorize', items, ok: true, inputTokens, outputTokens })

test('cost from per-1M prices; unknown models counted but not priced', () => {
  const prices = { a: { input: 1, output: 5 } }
  expect(costOf(u('a', 1_000_000, 200_000), prices.a)).toBe(2)
  const s = summarize([u('a', 2000, 1000), u('b', 500, 500)], prices)
  expect(s).toEqual({ requests: 2, inputTokens: 2500, outputTokens: 1500, cost: (2000 * 1 + 1000 * 5) / 1e6, unpriced: 1 })
})

test('estimate scales average tokens per merchant', () => {
  const rows = [u('a', 1000, 500, 10), u('a', 3000, 1500, 30)] // 100 in / 50 out per merchant
  expect(estimate(rows, 100, { input: 1, output: 5 })).toBeCloseTo((10_000 * 1 + 5_000 * 5) / 1e6)
  expect(estimate([], 100, { input: 1, output: 5 })).toBeUndefined()
})
