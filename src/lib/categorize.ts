import type { LanguageModel } from 'ai'
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
Category hints (Japanese examples):
- groceries: supermarkets (マルエツ, イオン, ライフ); dining: restaurants, cafes, fast food, food delivery
- daily_goods: drugstores, 100-yen shops, household supplies (マツキヨ, ダイソー); convenience stores go to groceries unless clearly otherwise
- transport: trains, buses, taxis, IC top-ups (JR, PASMO, Suica); car: fuel, parking, ETC tolls, car loan, 車検
- rent: rent, management fees; utilities: electricity, gas, water (電気, ガス, 水道); phone_internet: mobile, broadband
- clothing_beauty: clothes, shoes, hair salons, cosmetics (ユニクロ, 美容院); health: clinics, dentists, pharmacies (歯科, 病院, 薬局)
- insurance: life, medical, fire, car insurance premiums (生命保険, 損保); taxes_social: 住民税, 所得税, 国民年金, 国民健康保険
- education: schools, courses, books for study, cram school (学費, 塾); gifts_social: gifts, donations, weddings, drinking parties with others
- subscriptions: recurring digital services (Netflix, Spotify, iCloud, SaaS); entertainment: games, events, hobbies
- card_payment: a credit-card bill debited from a bank account (カード, 引落, 口座振替 to a card company)
- cash_withdrawal: ATM / cash out (ATM, 現金引出)
- income: salary 給与; bonus 賞与; side_income freelance or marketplace sales (メルカリ); investment dividends or securities (配当, 証券); refund 返金 or tax refunds
Return one result per input item.`

export type TokenUsage = { inputTokens: number; outputTokens: number }

// onUsage fires for every billed response, including ones whose output failed to parse
export function aiGenerate(model: LanguageModel | Promise<LanguageModel>, onUsage?: (usage: TokenUsage, items: number, ok: boolean) => void): Generate {
  const report = (u: { inputTokens?: number; outputTokens?: number } | undefined, items: number, ok: boolean) =>
    u && onUsage?.({ inputTokens: u.inputTokens ?? 0, outputTokens: u.outputTokens ?? 0 }, items, ok)
  return async (items) => {
    const { NoObjectGeneratedError, Output, generateText } = await import('ai')
    try {
      const { output, usage } = await generateText({
        model: await model,
        system: SYSTEM,
        prompt: JSON.stringify(items),
        output: Output.object({ schema }),
        providerOptions: { openai: { store: false } },
      })
      report(usage, items.length, true)
      return output.results
    } catch (e) {
      if (NoObjectGeneratedError.isInstance(e)) report(e.usage, items.length, false)
      throw e
    }
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
  const live = await liveMerchantIds()
  return db.merchants.filter((m) => !m.aiCategory && live.has(m.id)).toArray()
}

async function liveMerchantIds() {
  return new Set((await db.txns.toArray()).filter((t) => t.kind !== 'transfer').map((t) => merchantId(t.kind as Flow, t.merchantKey)))
}

type Progress = (processed: number, total: number) => void
export const BATCH_SIZE = 50 // merchants per AI request

export async function categorizePending(generate: Generate, batchSize = BATCH_SIZE, onProgress?: Progress) {
  return categorizeMerchants(await pendingMerchants(), generate, batchSize, onProgress)
}

// Merchants with transactions whose category the AI owns (a user-picked category is never sent or changed)
export async function recategorizableMerchants(): Promise<Merchant[]> {
  const live = await liveMerchantIds()
  return db.merchants.filter((m) => !m.overrideCategory && live.has(m.id)).toArray()
}

// Re-runs the AI over every merchant it owns, e.g. after new categories ship. A failed batch keeps its
// previous category and is only flagged for review.
export async function recategorizeAll(generate: Generate, batchSize = BATCH_SIZE, onProgress?: Progress) {
  return categorizeMerchants(await recategorizableMerchants(), generate, batchSize, onProgress)
}

async function categorizeMerchants(pending: Merchant[], generate: Generate, batchSize: number, onProgress?: Progress) {
  onProgress?.(0, pending.length)
  let done = 0
  let failed = 0
  for (let i = 0; i < pending.length; i += batchSize) {
    const chunk = pending.slice(i, i + batchSize)
    try {
      // a user rename is the better hint when the bank text was mangled
      const results = await generate(chunk.map((m) => ({ id: m.id, name: m.overrideName ?? m.displayName, kind: m.kind })))
      const byId = new Map(results.map((r) => [r.id, r]))
      // update only AI-owned fields: a run can take minutes and the user may edit overrides meanwhile
      await db.merchants.bulkUpdate(chunk.map((m) => {
        const { displayName, aiCategory, confidence, needsReview } = applyResult(m, byId.get(m.id))
        return { key: m.id, changes: { displayName, aiCategory, confidence, needsReview } }
      }))
      done += chunk.filter((m) => byId.has(m.id)).length
    } catch (e) {
      console.error('categorize failed', e)
      await db.merchants.bulkUpdate(chunk.map((m) => ({ key: m.id, changes: { needsReview: true } })))
      failed += chunk.length
    }
    onProgress?.(i + chunk.length, pending.length)
  }
  return { done, failed }
}
