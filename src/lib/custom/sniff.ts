import { decode, parseCsv } from '../csv'

export const ENCODINGS = ['utf-8', 'shift_jis', 'big5', 'gbk', 'euc-kr'] as const
export type Encoding = (typeof ENCODINGS)[number]
export const DELIMITERS = [',', '\t', ';'] as const
export type Delimiter = (typeof DELIMITERS)[number]

// Statement header words in ja / zh-Hans / zh-Hant / ko; only the right legacy decoding produces them
const KEYWORDS = /日付|摘要|金額|残高|入金|出金|取引|日期|交易|金额|余额|收入|支出|餘額|存入|提出|說明|说明|거래|일자|금액|잔액|입금|출금|적요|내용/g

function plausibility(text: string): number {
  const head = text.slice(0, 2000)
  const count = (re: RegExp) => head.match(re)?.length ?? 0
  return count(KEYWORDS) * 10 + count(/[\uAC00-\uD7AF]/g) - count(/[\uFF61-\uFF9F]/g) * 2 - count(/[\uE000-\uF8FF\uFFFD]/g) * 5
}

// Strict UTF-8 is reliable, so it wins outright. Legacy CJK encodings accept each other's bytes (Big5 swallows GBK and
// EUC-KR), so among those that decode cleanly, pick the one whose text looks most like a real statement.
export function detectEncoding(bytes: ArrayBuffer): Encoding {
  const decoded = ENCODINGS.flatMap((e) => {
    try {
      return [{ e, text: new TextDecoder(e, { fatal: true }).decode(bytes) }]
    } catch {
      return []
    }
  })
  if (decoded[0]?.e === 'utf-8') return 'utf-8'
  let best = decoded[0]
  for (const d of decoded) if (plausibility(d.text) > plausibility(best.text)) best = d
  return best?.e ?? 'utf-8'
}

const mode = (xs: number[]) => {
  const counts = new Map<number, number>()
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0] ?? [0, 0]
}

// The delimiter whose per-line count is most consistent (preamble lines have none)
export function detectDelimiter(text: string): Delimiter {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 30)
  let best: Delimiter = ','
  let bestLines = 0
  for (const d of DELIMITERS) {
    const [, n] = mode(lines.map((l) => l.split(d).length - 1).filter((c) => c > 0))
    if (n > bestLines) [best, bestLines] = [d, n]
  }
  return best
}

const numericish = (cell: string) => /^[\d\s.,\-/:()+\p{Sc}]*$/u.test(cell)

// First row at least as wide as the data (banks drop trailing empty cells on data rows) that looks like labels
export function detectHeaderRow(rows: string[][]): number {
  const head = rows.slice(0, 30)
  const [width] = mode(head.map((r) => r.length).filter((n) => n > 1))
  const i = head.findIndex(
    (r) => r.length >= Math.max(width, 3) && r.filter((c) => c.trim()).length * 2 >= width && r.filter((c) => c.trim() && numericish(c)).length * 2 < width,
  )
  return i > 19 ? -1 : i // -1: nothing looks like a header; the user must pick it (never guess the preamble)
}

export function readRows(bytes: ArrayBuffer, encoding: Encoding, delimiter: Delimiter) {
  return parseCsv(decode(bytes, encoding), delimiter)
}

export function sniff(bytes: ArrayBuffer) {
  const encoding = detectEncoding(bytes)
  const delimiter = detectDelimiter(decode(bytes, encoding))
  const rows = readRows(bytes, encoding, delimiter)
  return { encoding, delimiter, rows, headerRow: detectHeaderRow(rows) }
}
