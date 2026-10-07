import { type LanguageModel, Output, generateText } from 'ai'
import { z } from 'zod'
import { db } from './db'
import { AI_INCOME, AI_SPENDING, type Flow, type Merchant, merchantId } from './types'

const schema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      display_name: z.string(),
      category: z.enum([...AI_SPENDING, ...AI_INCOME]),
      confidence: z.number(),
    }),
  ),
})

export type Item = { id: string; name: string; kind: Flow }
export type AiResult = z.infer<typeof schema>['results'][number]
export type Generate = (items: Item[]) => Promise<AiResult[]>

const SYSTEM = `You categorize merchant names from bank and e-wallet transaction exports (mostly Asia; currently Japanese MUFG and PayPay).
Names may be truncated, half-width katakana, romanized abbreviations, or card-network descriptors
(e.g. "JRC SHIN" = JR Central Shinkansen, "AMAZON.C" = Amazon, "SP" prefix = Shopify store).
For each item return:
- id: copied unchanged
- display_name: the clean, human-readable merchant name in its usual script (keep Japanese names Japanese)
- category: for kind "expense" one of ${AI_SPENDING.join(', ')}; for kind "income" one of ${AI_INCOME.join(', ')}
- confidence: 0..1, below 0.6 if you are guessing
Return one result per input item.`

export function aiGenerate(model: LanguageModel): Generate {
  return async (items) => {
    const { output } = await generateText({
      model,
      system: SYSTEM,
      prompt: JSON.stringify(items),
      output: Output.object({ schema }),
      providerOptions: { openai: { store: false } },
    })
    return output.results
  }
}

export function applyResult(m: Merchant, r?: AiResult): Merchant {
  if (!r) return { ...m, needsReview: true }
  const allowed: readonly string[] = m.kind === 'expense' ? AI_SPENDING : AI_INCOME
  const valid = allowed.includes(r.category)
  return {
    ...m,
    displayName: r.display_name || m.displayName,
    aiCategory: valid ? r.category : m.kind === 'expense' ? 'other' : 'other_income',
    confidence: r.confidence,
    needsReview: !valid || r.confidence < 0.6,
  }
}

// Uncategorized merchants that still have transactions (deleted uploads must not leak names to the AI)
export async function pendingMerchants(): Promise<Merchant[]> {
  const live = new Set((await db.txns.toArray()).filter((t) => t.kind !== 'transfer').map((t) => merchantId(t.kind as Flow, t.merchantKey)))
  return db.merchants.filter((m) => !m.aiCategory && live.has(m.id)).toArray()
}

export async function categorizePending(generate: Generate, batchSize = 50) {
  const pending = await pendingMerchants()
  let done = 0
  let failed = 0
  for (let i = 0; i < pending.length; i += batchSize) {
    const chunk = pending.slice(i, i + batchSize)
    try {
      const results = await generate(chunk.map((m) => ({ id: m.id, name: m.displayName, kind: m.kind })))
      const byId = new Map(results.map((r) => [r.id, r]))
      await db.merchants.bulkPut(chunk.map((m) => applyResult(m, byId.get(m.id))))
      done += chunk.filter((m) => byId.has(m.id)).length
    } catch (e) {
      console.error('categorize failed', e)
      await db.merchants.bulkPut(chunk.map((m) => ({ ...m, needsReview: true })))
      failed += chunk.length
    }
  }
  return { done, failed }
}
