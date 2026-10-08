import { isPersonTransfer, normalizeMerchant } from '../normalize'
import type { CustomMapping, ParsedRow } from '../types'
import { parseDate, parseMinor, parseTime } from './values'

// Bank exports pad cells with spaces and wrap refs in '…' so spreadsheets keep them as text
export const clean = (c: string | undefined) =>
  (c ?? '')
    .trim()
    .replace(/^'(.*)'$/, '$1')
    .trim()

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
  return normalizeMerchant(
    text
      .split(/\s+/)
      .filter((t) => (t.match(/\d/g)?.length ?? 0) < 4)
      .join(' '),
  )
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
  if (m.timeCol !== undefined && !ok(m.timeCol)) errors.push('timeCol')
  if (m.balanceCol !== undefined && !ok(m.balanceCol)) errors.push('balanceCol')
  return errors
}

export function parseCustom(rows: string[][], m: CustomMapping, digits: number): ParsedRow[] {
  const seen = new Map<string, number>()
  const out: ParsedRow[] = []
  const amountCols = m.amount.mode === 'signed' ? [m.amount.col] : [m.amount.outCol, m.amount.inCol]
  // a row that fails only matters if real rows follow it; trailing "Total 2026-09 …" summaries are dropped
  let failed: unknown
  for (const r of rows.slice(m.headerRow + 1)) {
    if (!/\d/.test(clean(r[m.dateCol]))) continue // blank lines, "Total" footers
    let row: Omit<ParsedRow, 'key'> | undefined
    try {
      row = parseRow(r, m, digits)
    } catch (e) {
      if (amountCols.some((c) => clean(r[c]))) failed ??= e
      continue
    }
    if (failed) throw failed
    if (!row) continue
    // key from the raw cells, so re-mapping columns later never re-imports the same row;
    // the occurrence index keeps genuinely identical rows apart
    const base = trimEnd(r).join('\u001f')
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    out.push({ ...row, key: `${base}#${n}` })
  }
  if (failed && !out.length) throw failed // nothing parsed: the mapping is wrong, not a footer
  return out
}

function parseRow(r: string[], m: CustomMapping, digits: number): Omit<ParsedRow, 'key'> | undefined {
  const date = parseDate(clean(r[m.dateCol]), m.dateFormat)
  const rawMerchant = m.descriptionCols
    .map((c) => clean(r[c]))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
  let kind: ParsedRow['kind']
  let amount: number
  if (m.amount.mode === 'signed') {
    const v = parseMinor(clean(r[m.amount.col]), digits)
    if (v === 0) return undefined
    kind = v < 0 === (m.amount.negativeIs === 'expense') ? 'expense' : 'income'
    amount = Math.abs(v)
  } else {
    // some banks write withdrawals as negatives in the debit column; the column already says the direction
    const debit = Math.abs(parseMinor(clean(r[m.amount.outCol]), digits))
    const credit = Math.abs(parseMinor(clean(r[m.amount.inCol]), digits))
    if (debit) [kind, amount] = ['expense', debit]
    else if (credit) [kind, amount] = ['income', credit]
    else return undefined
  }
  const time = parseTime(clean(r[m.timeCol ?? m.dateCol]))
  const fixedCategory = isPersonTransfer(rawMerchant) ? (kind === 'expense' ? 'transfer_out' : 'transfer_in') : undefined
  return { date, time, kind, amount, rawMerchant, merchantKey: customMerchantKey(rawMerchant), fixedCategory }
}
