import { decode, parseCsv } from '../csv'

export const ENCODINGS = ['utf-8', 'shift_jis', 'big5', 'gbk', 'euc-kr'] as const
export type Encoding = (typeof ENCODINGS)[number]
export const DELIMITERS = [',', '\t', ';'] as const
export type Delimiter = (typeof DELIMITERS)[number]

// First encoding that decodes without errors; strict UTF-8 goes first because legacy encodings accept almost anything
export function detectEncoding(bytes: ArrayBuffer): Encoding {
  for (const e of ENCODINGS) {
    try {
      new TextDecoder(e, { fatal: true }).decode(bytes)
      return e
    } catch {}
  }
  return 'utf-8'
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
    (r) => r.length >= width && r.filter((c) => c.trim()).length * 2 >= width && r.filter((c) => c.trim() && numericish(c)).length * 2 < width,
  )
  return Math.max(0, Math.min(i, 19))
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
