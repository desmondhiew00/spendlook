import { expect, test } from 'bun:test'
import { isMufg, parseMufg } from './mufg'

const H = ['日付', '摘要', '摘要内容', '支払い金額', '預かり金額', '差引残高', 'メモ', '未資金化区分', '入払区分']
const r = (...cells: string[]) => [...cells, '', '', '']

test('detects header', () => {
  expect(isMufg([H])).toBe(true)
  expect(isMufg([['取引日', '出金金額（円）']])).toBe(false)
})

test('maps every MUFG row kind', () => {
  const rows = parseMufg([
    H,
    r('2026/7/2', 'デビット１', '５５３７９９　ＪＲＣ　ＳＨＩＮ', '10,560', '', '467,152'),
    r('2026/7/3', '口座振替', 'ＲＴＫ　ペイペイ', '5,000', '', '462,152'),
    r('2026/8/18', 'デビット３', '５５３７９９　ＪＲＣ　ＳＨＩＮ', '', '10,560', '472,712'),
    r('2026/7/24', '振込１', 'アスカル　（カ', '', '299,536', '772,248'),
    r('2026/7/27', 'Ｄ現金還元', '８ネン　６ガツブン', '', '734', '772,982'),
    r('2026/8/17', '利息', 'ス−パ−フツウ', '', '485', '773,467'),
  ])
  expect(rows.map((x) => [x.date, x.kind, x.amount, x.merchantKey, x.fixedCategory])).toEqual([
    ['2026-07-02', 'expense', 10560, 'JRC SHIN', undefined],
    ['2026-07-03', 'expense', 5000, 'RTK ペイペイ', 'paypay'],
    ['2026-08-18', 'expense', -10560, 'JRC SHIN', undefined], // refund nets against charge
    ['2026-07-24', 'income', 299536, 'アスカル (カ', undefined],
    ['2026-07-27', 'income', 734, '8ネン 6ガツブン', 'cashback_points'],
    ['2026-08-17', 'income', 485, 'スーパーフツウ', 'interest'],
  ])
})

test('dedupe key differs for same-day identical charges (balance differs)', () => {
  const [a, b] = parseMufg([H, r('2026/7/2', 'デビット１', 'X', '100', '', '900'), r('2026/7/2', 'デビット１', 'X', '100', '', '800')])
  expect(a.key).not.toBe(b.key)
})

test('empty 摘要内容 falls back to 摘要 as merchant', () => {
  const [row] = parseMufg([H, r('2026/9/1', 'カ−ド', '', '20,000', '', '1')])
  expect(row.merchantKey).toBe('カード')
})

test('transfers to and from people get a fixed category, so their names never reach the AI', () => {
  const rows = parseMufg([H, r('2026/7/5', '振込１', 'ヤマダ　タロウ', '', '20,000', '100,000'), r('2026/7/6', '振込２', 'スズキ　ハナコ', '5,000', '', '95,000')])
  expect(rows.map((x) => [x.kind, x.fixedCategory])).toEqual([
    ['income', 'transfer_in'],
    ['expense', 'transfer_out'],
  ])
})
