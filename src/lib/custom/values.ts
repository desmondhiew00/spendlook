export const DATE_FORMATS = ['YMD', 'DMY', 'MDY', 'YYYYMMDD', 'D MMM Y'] as const
export type DateFormat = (typeof DATE_FORMATS)[number]

export function fractionDigits(currency: string): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 0
}

// String arithmetic, never float math: "0.29" @2 must be exactly 29
export function parseMinor(s: string | undefined, digits: number): number {
  let t = (s ?? '').replace(/[\s,]/g, '')
  if (t === '' || t === '-') return 0
  let negative = false
  if (/^\(.*\)$/.test(t)) {
    negative = true
    t = t.slice(1, -1)
  }
  // currency codes/symbols around the number: S$12, RM12, ¥12, 12円, 12 USD
  t = t.replace(/^-?[A-Z]{0,3}\p{Sc}?/u, (m) => (m.startsWith('-') ? '-' : '')).replace(/(\p{Sc}|[A-Z]{1,3}|円|元|원)$/u, '')
  const m = t.match(/^(-?)(\d+)(?:\.(\d+))?$/)
  if (!m || (m[3] ?? '').length > digits) throw new Error(`Bad amount: ${s}`)
  const n = Number(m[2] + (m[3] ?? '').padEnd(digits, '0'))
  return (m[1] === '-') !== negative ? -n : n
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export function parseDate(s: string, fmt: DateFormat): string {
  const t = s.trim()
  let ymd: number[] | undefined
  if (fmt === 'YYYYMMDD') {
    const x = t.match(/^(\d{4})(\d{2})(\d{2})/)
    if (x) ymd = [+x[1], +x[2], +x[3]]
  } else if (fmt === 'D MMM Y') {
    const x = t.match(/^(\d{1,2})[\s\-/.]+([A-Za-z]{3})[A-Za-z]*\.?[\s\-/.]+(\d{2,4})/)
    if (x) ymd = [+x[3], MONTHS.indexOf(x[2].toUpperCase()) + 1, +x[1]]
  } else {
    const n = t.match(/\d+/g)?.map(Number)
    if (n && n.length >= 3) ymd = fmt === 'YMD' ? [n[0], n[1], n[2]] : fmt === 'DMY' ? [n[2], n[1], n[0]] : [n[2], n[0], n[1]]
  }
  if (!ymd) throw new Error(`Bad date: ${s}`)
  let [y, m, d] = ymd
  if (y < 100) y += 2000
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  if (y < 1900 || m < 1 || m > 12 || d < 1 || d > daysInMonth) throw new Error(`Bad date: ${s}`)
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
