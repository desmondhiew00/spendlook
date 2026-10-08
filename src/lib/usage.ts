import { aiGenerate } from './categorize'
import { aiDetectMapping } from './custom/ai'
import { db } from './db'
import { makeModel } from './model'
import type { AiSettings } from './settings'
import type { AiUsage } from './types'

export interface Price {
  input: number
  output: number
} // USD per 1M tokens

// Pre-filled for the default models, checked 2026-10. Anthropic from its published model table; Google and OpenAI
// from public price trackers. Estimates only, editable in Settings; the provider's billing page is the truth.
export const DEFAULT_PRICES: Record<string, Price> = {
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-opus-5': { input: 5, output: 25 },
  'gpt-5.4-mini': { input: 0.75, output: 4.5 },
  'gpt-5.4-nano': { input: 0.2, output: 1.25 },
  'gpt-5.4': { input: 2.5, output: 15 },
  'gpt-5-mini': { input: 0.25, output: 2 },
  'gpt-5-nano': { input: 0.05, output: 0.4 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
  'gemini-3.5-flash': { input: 1.5, output: 9 },
  'gemini-3.1-flash-lite': { input: 0.25, output: 1.5 },
  'gemini-3.1-pro-preview': { input: 2, output: 12 },
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.5-pro': { input: 1.25, output: 10 },
}

const KEY = 'ai-prices'

export function loadPrices(): Record<string, Price> {
  try {
    return { ...DEFAULT_PRICES, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return { ...DEFAULT_PRICES }
  }
}

export function savePrice(model: string, price: Price) {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    localStorage.setItem(KEY, JSON.stringify({ ...saved, [model]: price }))
  } catch {}
}

export const costOf = (u: Pick<AiUsage, 'inputTokens' | 'outputTokens'>, p?: Price) => (p ? (u.inputTokens * p.input + u.outputTokens * p.output) / 1e6 : undefined)

export function summarize(rows: AiUsage[], prices: Record<string, Price>) {
  let cost = 0
  let unpriced = 0
  for (const r of rows) {
    const c = costOf(r, prices[r.model])
    if (c === undefined) unpriced++
    else cost += c
  }
  return {
    requests: rows.length,
    inputTokens: rows.reduce((s, r) => s + r.inputTokens, 0),
    outputTokens: rows.reduce((s, r) => s + r.outputTokens, 0),
    cost,
    unpriced, // requests on a model with no price set; excluded from cost
  }
}

// Average tokens per merchant from past categorize runs, to preview what a run of n merchants costs
export function estimate(rows: AiUsage[], n: number, price?: Price) {
  const sample = rows.filter((r) => r.ok && r.job !== 'test' && r.items > 0)
  const items = sample.reduce((s, r) => s + r.items, 0)
  if (!items || !price) return undefined
  const per = summarize(sample, {}) // tokens only
  return costOf({ inputTokens: (per.inputTokens / items) * n, outputTokens: (per.outputTokens / items) * n }, price)
}

// The one place AI calls are built, so every request is logged
export function aiFor(s: AiSettings, job: AiUsage['job']) {
  return aiGenerate(makeModel(s), (u, items, ok) => {
    db.usage.add({ id: crypto.randomUUID(), at: Date.now(), provider: s.provider, model: s.model, job, items, ok, ...u })
  })
}

export function aiMappingFor(s: AiSettings) {
  return aiDetectMapping(makeModel(s), (u, ok) => {
    db.usage.add({ id: crypto.randomUUID(), at: Date.now(), provider: s.provider, model: s.model, job: 'map_columns', items: 0, ok, ...u })
  })
}
