import { yen } from '../csv'
import { normalizeMerchant } from '../normalize'
import type { ParsedRow } from '../types'

const HEADER = ['日付', '摘要', '摘要内容', '支払い金額', '預かり金額', '差引残高']

export const isMufg = (rows: string[][]) => HEADER.every((h, i) => rows[0]?.[i] === h)

export function parseMufg(rows: string[][]): ParsedRow[] {
  return rows.slice(1).map(([d, tekiyo, content, outS, inS, balance]): ParsedRow => {
    const out = yen(outS)
    const inn = yen(inS)
    const [y, m, day] = d.split('/')
    const rawMerchant = content || tekiyo
    const merchantKey = normalizeMerchant(rawMerchant)
    const type = normalizeMerchant(tekiyo)
    const base = {
      key: [d, tekiyo, content, outS, inS, balance].join('|'),
      date: `${y}-${m.padStart(2, '0')}-${day.padStart(2, '0')}`,
      rawMerchant,
      merchantKey,
    }
    if (out > 0) {
      return { ...base, kind: 'expense', amount: out, fixedCategory: /ペイペイ|PAYPAY/.test(merchantKey) ? 'paypay' : undefined }
    }
    if (type.startsWith('デビット')) return { ...base, kind: 'expense', amount: -inn }
    if (type === 'D現金還元') return { ...base, kind: 'income', amount: inn, fixedCategory: 'cashback_points' }
    if (type === '利息') return { ...base, kind: 'income', amount: inn, fixedCategory: 'interest' }
    return { ...base, kind: 'income', amount: inn }
  })
}
