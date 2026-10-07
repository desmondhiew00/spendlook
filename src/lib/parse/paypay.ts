import { yen } from '../csv'
import { normalizeMerchant } from '../normalize'
import type { ParsedRow } from '../types'

const HEADER = ['取引日', '出金金額（円）', '入金金額（円）']

export const isPaypay = (rows: string[][]) => HEADER.every((h, i) => rows[0]?.[i] === h)

export function parsePaypay(rows: string[][]): ParsedRow[] {
  const header = rows[0]
  const col = (r: string[], name: string) => r[header.indexOf(name)] ?? ''
  return rows.slice(1).map((r): ParsedRow => {
    const out = yen(col(r, '出金金額（円）'))
    const inn = yen(col(r, '入金金額（円）'))
    const party = col(r, '取引先')
    const base = {
      key: `${col(r, '取引番号')}|${col(r, '取引内容')}`, // points rows reuse the payment's 取引番号
      date: col(r, '取引日').slice(0, 10).replaceAll('/', '-'),
      rawMerchant: party,
      merchantKey: normalizeMerchant(party.split(' - ')[0]), // chain, not branch
      method: col(r, '取引方法'),
    }
    switch (col(r, '取引内容')) {
      case '支払い':
      case '請求書払い':
        return { ...base, kind: 'expense', amount: out }
      case '返金':
        return { ...base, kind: 'expense', amount: -inn }
      case '送った金額':
        return { ...base, kind: 'expense', amount: out, fixedCategory: 'transfer_out' }
      case '受け取った金額':
        return { ...base, kind: 'income', amount: inn, fixedCategory: 'transfer_in' }
      case 'ポイント、残高の獲得':
        return { ...base, kind: 'income', amount: inn, fixedCategory: 'cashback_points' }
      case 'チャージ':
        return { ...base, kind: 'transfer', amount: inn }
      default:
        return out > 0 ? { ...base, kind: 'expense', amount: out } : { ...base, kind: 'income', amount: inn }
    }
  })
}
