import { normalizeMerchant } from '../normalize'
import type { CustomMapping, ParsedRow } from '../types'
import { parseDate, parseMinor } from './values'

// Bank exports pad cells with spaces and wrap refs in '…' so spreadsheets keep them as text
export const clean = (c: string | undefined) => (c ?? '').trim().replace(/^'(.*)'$/, '$1').trim()

const trimEnd = (cells: string[]) => {
  const out = cells.map(clean)
  while (out.length && !out[out.length - 1]) out.pop()
  return out
}

export function headerMatches(rows: string[][], m: CustomMapping): boolean {
  return JSON.stringify(trimEnd(rows[m.headerRow] ?? [])) === JSON.stringify(trimEnd(m.header))
}

// Merchant key drops card numbers and reference codes (tokens with 4+ digits) so the same merchant groups together
export function customMerchantKey(text: string): string {
  return normalizeMerchant(text.split(/\s+/).filter((t) => (t.match(/\d/g)?.length ?? 0) < 4).join(' '))
}

export function validateMapping(m: CustomMapping, columnCount: number): string[] {
  const ok = (c: number | undefined) => c !== undefined && Number.isInteger(c) && c >= 0 && c < columnCount
  const amountCols = m.amount.mode === 'signed' ? [m.amount.col] : [m.amount.outCol, m.amount.inCol]
  const errors: string[] = []
  if (!ok(m.dateCol)) errors.push('dateCol')
  if (!amountCols.every(ok) || amountCols.includes(m.dateCol) || new Set(amountCols).size !== amountCols.length) errors.push('amount')
  if (!m.descriptionCols.length || !m.descriptionCols.every(ok) || m.descriptionCols.some((c) => c === m.dateCol || amountCols.includes(c))) {
    errors.push('descriptionCols')
  }
  if (m.idCol !== undefined && !ok(m.idCol)) errors.push('idCol')
  if (m.balanceCol !== undefined && !ok(m.balanceCol)) errors.push('balanceCol')
  return errors
}

export function parseCustom(rows: string[][], m: CustomMapping, digits: number): ParsedRow[] {
  const seen = new Map<string, number>()
  const out: ParsedRow[] = []
  for (const r of rows.slice(m.headerRow + 1)) {
    if (!/\d/.test(clean(r[m.dateCol]))) continue // blank lines, "Total" footers
    const date = parseDate(clean(r[m.dateCol]), m.dateFormat)
    const rawMerchant = m.descriptionCols.map((c) => clean(r[c])).filter(Boolean).join(' ').replace(/\s+/g, ' ')
    let kind: ParsedRow['kind']
    let amount: number
    if (m.amount.mode === 'signed') {
      const v = parseMinor(clean(r[m.amount.col]), digits)
      if (v === 0) continue
      kind = (v < 0) === (m.amount.negativeIs === 'expense') ? 'expense' : 'income'
      amount = Math.abs(v)
    } else {
      const debit = parseMinor(clean(r[m.amount.outCol]), digits)
      const credit = parseMinor(clean(r[m.amount.inCol]), digits)
      if (debit) [kind, amount] = ['expense', debit]
      else if (credit) [kind, amount] = ['income', credit]
      else continue
    }
    // ids can repeat in bank exports, so they only sharpen the key; the occurrence index keeps identical rows apart
    const base = [date, rawMerchant, kind, amount, clean(r[m.balanceCol ?? -1]), clean(r[m.idCol ?? -1])].join('|')
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    out.push({ key: `${base}#${n}`, date, kind, amount, rawMerchant, merchantKey: customMerchantKey(rawMerchant) })
  }
  return out
}
