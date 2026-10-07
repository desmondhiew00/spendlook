import { expect, test } from 'bun:test'
import { isPaypay, parsePaypay } from './paypay'

const H = ['取引日', '出金金額（円）', '入金金額（円）', '海外出金金額', '通貨', '変換レート（円）', '利用国', '取引内容', '取引先', '取引方法', '支払い区分', '利用者', '取引番号']
const r = (date: string, out: string, inn: string, type: string, party: string, method: string, id: string) =>
  [date, out, inn, '-', '-', '-', '-', type, party, method, '-', '-', id]

test('detects header', () => {
  expect(isPaypay([H])).toBe(true)
  expect(isPaypay([['日付', '摘要']])).toBe(false)
})

test('maps every PayPay type', () => {
  const rows = parsePaypay([
    H,
    r('2026/10/01 16:39:18', '648', '-', '支払い', 'マルエツ - マルエツ所沢御幸町店', 'クレジット VISA 7949', 'a1'),
    r('2026/10/01 21:43:04', '3,860', '-', '請求書払い', '所沢市上下水道局', 'PayPay残高', 'a2'),
    r('2026/09/02 10:00:00', '-', '500', '返金', 'Steam', 'PayPay残高', 'a3'),
    r('2026/09/03 10:00:00', '1,000', '-', '送った金額', '山田 太郎', 'PayPay残高', 'a4'),
    r('2026/09/04 10:00:00', '-', '2,000', '受け取った金額', '山田 太郎', 'PayPay残高', 'a5'),
    r('2026/09/06 21:41:30', '-', '3', 'ポイント、残高の獲得', 'マルエツ', 'PayPayポイント', 'a6'),
    r('2026/10/01 21:43:02', '-', '5,000', 'チャージ', 'PayPay', '三菱ＵＦＪ銀行 *****11', 'a7'),
  ])
  expect(rows.map((x) => [x.key.split('|')[0], x.date, x.kind, x.amount, x.merchantKey, x.fixedCategory])).toEqual([
    ['a1', '2026-10-01', 'expense', 648, 'マルエツ', undefined],
    ['a2', '2026-10-01', 'expense', 3860, '所沢市上下水道局', undefined],
    ['a3', '2026-09-02', 'expense', -500, 'STEAM', undefined],
    ['a4', '2026-09-03', 'expense', 1000, '山田 太郎', 'transfer_out'],
    ['a5', '2026-09-04', 'income', 2000, '山田 太郎', 'transfer_in'],
    ['a6', '2026-09-06', 'income', 3, 'マルエツ', 'cashback_points'],
    ['a7', '2026-10-01', 'transfer', 5000, 'PAYPAY', undefined],
  ])
  expect(rows[0].time).toBe('16:39')
  expect(rows[0].rawMerchant).toBe('マルエツ - マルエツ所沢御幸町店')
  expect(rows[0].method).toBe('クレジット VISA 7949')
})

test('unknown type falls back on direction', () => {
  const [a, b] = parsePaypay([H, r('2026/09/01 00:00:00', '10', '-', '新種', 'X', '-', 'u1'), r('2026/09/01 00:00:00', '-', '10', '新種', 'Y', '-', 'u2')])
  expect([a.kind, b.kind]).toEqual(['expense', 'income'])
})

test('points row sharing a payment’s 取引番号 gets its own dedupe key', () => {
  const [pay, points] = parsePaypay([
    H,
    r('2026/09/06 21:41:30', '368', '-', '支払い', 'マルエツ', 'クレジット VISA 7949', 'same'),
    r('2026/09/06 21:41:30', '-', '3', 'ポイント、残高の獲得', 'マルエツ', 'PayPayポイント', 'same'),
  ])
  expect(pay.key).not.toBe(points.key)
})
