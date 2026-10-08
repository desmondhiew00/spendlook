import type { LanguageModel } from 'ai'
import { z } from 'zod'
import type { TokenUsage } from '../categorize'
import type { CustomMapping } from '../types'
import { clean } from './parse'
import type { Delimiter, Encoding } from './sniff'
import { DATE_FORMATS, type DateFormat, parseDate } from './values'

const col = z.number().int()
const schema = z.object({
  dateCol: col,
  dateFormat: z.enum(DATE_FORMATS),
  timeCol: col.nullable(),
  descriptionCols: z.array(col),
  amountMode: z.enum(['signed', 'split']),
  amountCol: col.nullable(),
  negativeIs: z.enum(['expense', 'income']).nullable(),
  outCol: col.nullable(),
  inCol: col.nullable(),
  idCol: col.nullable(),
  balanceCol: col.nullable(),
})
export type MappingGuess = z.infer<typeof schema>
export type MappingBase = { encoding: Encoding; delimiter: Delimiter; headerRow: number; header: string[] }

// Privacy bound from the spec: the header and at most 3 data rows ever leave the browser, and those rows only as
// their shape: digits become 0 and words become x, so "2026/09/03", "-1,234.50 DR" reach the AI as
// "0000/00/00", "-0,000.00 DR". Markers the mapping depends on (DR/CR, AM/PM) stay.
export const redact = (cell: string) => cell.replace(/\d/g, '0').replace(/\p{L}+/gu, (w) => (/^(DR|CR|AM|PM|午前|午後)$/i.test(w) ? w : 'x'.repeat(w.length)))

export function sampleForAi(rows: string[][], headerRow: number) {
  return {
    header: (rows[headerRow] ?? []).map(clean),
    samples: rows
      .slice(headerRow + 1)
      .filter((r) => r.some((c) => clean(c)))
      .slice(0, 3)
      .map((r) => r.map(clean)),
  }
}

const SYSTEM = `Sample cells are redacted to their shape: every digit is 0 and every word is x.
You map the columns of a bank or e-wallet CSV export (any country, any language) to transaction fields.
Columns are 0-based indexes into the header. Return:
- timeCol: a separate time-of-day column, else null (a time inside the date cell needs no column)
- dateCol and dateFormat: YMD (2026-09-03, 2026/9/3), DMY (03/09/2026, 03-09-2026), MDY (09/03/2026), YYYYMMDD, or "D MMM Y" (3 Sep 2026)
- descriptionCols: the column(s) that identify the merchant or counterparty, best first. Include a reference/detail column
  when the description is a generic transaction type (e.g. "DEBIT CARD", "DUITNOW TRSF DR", "POS PURCHASE")
- amountMode "split" with outCol (money out / debit / withdrawal) and inCol (money in / credit / deposit),
  or "signed" with amountCol and negativeIs ("expense" when outflows are negative; "income" for card statements where purchases are positive)
- idCol: a transaction id/reference column if one exists, else null. balanceCol: running balance if present, else null
Use null for fields that do not apply.`

export function aiDetectMapping(model: LanguageModel | Promise<LanguageModel>, onUsage?: (usage: TokenUsage, ok: boolean) => void) {
  const report = (u: { inputTokens?: number; outputTokens?: number } | undefined, ok: boolean) => u && onUsage?.({ inputTokens: u.inputTokens ?? 0, outputTokens: u.outputTokens ?? 0 }, ok)
  return async (header: string[], samples: string[][]): Promise<MappingGuess> => {
    const { NoObjectGeneratedError, Output, generateText } = await import('ai')
    try {
      const { output, usage } = await generateText({
        model: await model,
        system: SYSTEM,
        prompt: JSON.stringify({ header: header.map((name, index) => ({ index, name })), samples: samples.map((r) => r.map(redact)) }),
        output: Output.object({ schema }),
        providerOptions: { openai: { store: false } },
      })
      report(usage, true)
      return output
    } catch (e) {
      if (NoObjectGeneratedError.isInstance(e)) report(e.usage, false)
      throw e
    }
  }
}

export function guessToMapping(g: MappingGuess, base: MappingBase): CustomMapping {
  const inRange = (c: number | null) => (c !== null && c >= 0 && c < base.header.length ? c : undefined)
  return {
    ...base,
    dateCol: g.dateCol,
    dateFormat: g.dateFormat,
    timeCol: inRange(g.timeCol),
    descriptionCols: g.descriptionCols.filter((c) => inRange(c) !== undefined),
    amount: g.amountMode === 'signed' ? { mode: 'signed', col: g.amountCol ?? 0, negativeIs: g.negativeIs ?? 'expense' } : { mode: 'split', outCol: g.outCol ?? 0, inCol: g.inCol ?? 0 },
    idCol: inRange(g.idCol),
    balanceCol: inRange(g.balanceCol),
  }
}

const fits = (f: DateFormat, values: string[]) =>
  values.length > 0 &&
  values.every((v) => {
    try {
      parseDate(v, f)
      return true
    } catch {
      return false
    }
  })

export function detectDateFormat(cells: string[]): DateFormat {
  const values = cells.map(clean).filter(Boolean)
  return DATE_FORMATS.find((f) => fits(f, values)) ?? 'YMD'
}

// The AI saw redacted dates (0000/00/00), so check its pick against the real cells locally
export const checkDateFormat = (guess: DateFormat, cells: string[]) => (fits(guess, cells.map(clean).filter(Boolean)) ? guess : detectDateFormat(cells))

// No-AI starting point for "Map manually": common header names in en/ja/zh/ms/ko
export function localGuess(base: MappingBase, samples: string[][] = []): CustomMapping {
  const find = (re: RegExp, not: number[] = []) => {
    const i = base.header.findIndex((h, i) => !not.includes(i) && re.test(h))
    return i < 0 ? undefined : i
  }
  const dateCol = find(/date|日付|日期|日時|tarikh|날짜|일자/i) ?? 0
  const outCol = find(/debit|withdraw|money out|paid out|出金|支出|支払|引出|keluar|출금/i, [dateCol])
  const inCol = find(/credit|deposit|money in|paid in|入金|收入|預入|預かり|kredit|masuk|입금/i, [dateCol])
  const amountCol = find(/amount|金額|金额|jumlah|amaun|금액/i, [dateCol])
  const amount: CustomMapping['amount'] =
    outCol !== undefined && inCol !== undefined ? { mode: 'split', outCol, inCol } : { mode: 'signed', col: amountCol ?? Math.min(2, base.header.length - 1), negativeIs: 'expense' }
  const used = [dateCol, ...(amount.mode === 'split' ? [amount.outCol, amount.inCol] : [amount.col])]
  const description = find(/desc|detail|memo|payee|merchant|particular|narrative|摘要|内容|說明|说明|備考|取引先|keterangan|butiran|내용|적요/i, used)
  return {
    ...base,
    dateCol,
    dateFormat: detectDateFormat(samples.map((r) => r[dateCol] ?? '')),
    descriptionCols: [description ?? base.header.findIndex((_, i) => !used.includes(i))].filter((c) => c >= 0),
    amount,
    idCol: undefined,
    timeCol: find(/time|時刻|時間|时间|masa|시간|시각/i, [dateCol, ...used]),
    balanceCol: find(/balance|残高|余额|餘額|baki|잔액/i, used),
  }
}

// The bank changed its export: keep the user's picks for every column whose name still exists
export function carryOver(old: CustomMapping, base: MappingBase): CustomMapping | null {
  const at = (i: number) => base.header.indexOf(old.header[i])
  const opt = (i: number | undefined) => (i === undefined || at(i) < 0 ? undefined : at(i))
  const dateCol = at(old.dateCol)
  const descriptionCols = old.descriptionCols.map(at).filter((i) => i >= 0)
  const amount: CustomMapping['amount'] | null =
    old.amount.mode === 'signed'
      ? at(old.amount.col) < 0
        ? null
        : { ...old.amount, col: at(old.amount.col) }
      : at(old.amount.outCol) < 0 || at(old.amount.inCol) < 0
        ? null
        : { mode: 'split', outCol: at(old.amount.outCol), inCol: at(old.amount.inCol) }
  if (dateCol < 0 || !descriptionCols.length || !amount) return null
  return { ...base, dateCol, dateFormat: old.dateFormat, timeCol: opt(old.timeCol), descriptionCols, amount, idCol: opt(old.idCol), balanceCol: opt(old.balanceCol) }
}
