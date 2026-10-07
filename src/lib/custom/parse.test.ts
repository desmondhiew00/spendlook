import { expect, test } from 'bun:test'
import type { CustomMapping } from '../types'
import { headerMatches, parseCustom, validateMapping } from './parse'

const header = ['Date', 'Description', 'Amount', 'Balance', 'Ref']
const base: CustomMapping = {
  encoding: 'utf-8', delimiter: ',', headerRow: 1, header,
  dateCol: 0, dateFormat: 'DMY', descriptionCols: [1],
  amount: { mode: 'signed', col: 2, negativeIs: 'expense' },
}
const rows = (...data: string[][]) => [['Statement'], header, ...data]

test('signed amounts: negative is expense', () => {
  const [a, b] = parseCustom(rows(['03/09/2026', 'GRAB *RIDE', '-12.50', '987.50', 'r1'], ['04/09/2026', 'SALARY', '3,000.00', '3987.50', 'r2']), base, 2)
  expect([a.date, a.kind, a.amount, a.merchantKey, a.rawMerchant]).toEqual(['2026-09-03', 'expense', 1250, 'GRAB *RIDE', 'GRAB *RIDE'])
  expect([b.kind, b.amount]).toEqual(['income', 300000])
})

test('signed amounts: negative is income (card statements)', () => {
  const [a] = parseCustom(rows(['03/09/2026', 'SHOP', '12.50', '', '']), { ...base, amount: { mode: 'signed', col: 2, negativeIs: 'income' } }, 2)
  expect([a.kind, a.amount]).toEqual(['expense', 1250])
})

test('split out/in columns; zero rows skipped', () => {
  const m: CustomMapping = { ...base, amount: { mode: 'split', outCol: 2, inCol: 3 } }
  const out = parseCustom(rows(['03/09/2026', 'SHOP', '5.00', '', ''], ['04/09/2026', 'REFUND', '', '2.00', ''], ['05/09/2026', 'NOTHING', '', '', '']), m, 2)
  expect(out.map((r) => [r.kind, r.amount])).toEqual([['expense', 500], ['income', 200]])
})

test('a non-unique id column still yields distinct keys for different rows', () => {
  const m = { ...base, idCol: 4 }
  const [a, b] = parseCustom(rows(['03/09/2026', 'SHOP', '-1', '', 'R1'], ['03/09/2026', 'SHOP', '-2', '', 'R1']), m, 2)
  expect(a.key).not.toBe(b.key)
  expect(a.key).toContain('R1')
})

test('without id: identical same-day rows get distinct, stable keys', () => {
  const r = ['03/09/2026', 'COFFEE', '-4.50', '', '']
  const first = parseCustom(rows(r, r), base, 2).map((x) => x.key)
  const again = parseCustom(rows(['02/09/2026', 'OTHER', '-1', '', ''], r, r), base, 2).map((x) => x.key)
  expect(first[0]).not.toBe(first[1])
  expect(again.slice(1)).toEqual(first) // overlapping export → same keys → deduped, nothing lost
})

test('footer and blank rows without a digit in the date cell are skipped', () => {
  const out = parseCustom(rows(['03/09/2026', 'SHOP', '-1', '', ''], ['Total', '', '-1', '', ''], ['']), base, 2)
  expect(out).toHaveLength(1)
})

test('unparseable amount or date throws', () => {
  expect(() => parseCustom(rows(['03/09/2026', 'SHOP', 'n/a', '', '']), base, 2)).toThrow('Bad amount')
  expect(() => parseCustom(rows(['33/09/2026', 'SHOP', '-1', '', '']), base, 2)).toThrow('Bad date')
})

test('validateMapping flags out-of-range and duplicate-role columns', () => {
  expect(validateMapping(base, 5)).toEqual([])
  expect(validateMapping({ ...base, dateCol: 7 }, 5)).toContain('dateCol')
  expect(validateMapping({ ...base, amount: { mode: 'split', outCol: 2, inCol: 2 } }, 5)).toContain('amount')
  expect(validateMapping({ ...base, descriptionCols: [0] }, 5)).toContain('descriptionCols')
  expect(validateMapping({ ...base, descriptionCols: [] }, 5)).toContain('descriptionCols')
})

test('headerMatches compares the saved header at the saved row', () => {
  expect(headerMatches(rows(), base)).toBe(true)
  expect(headerMatches([['Statement'], ['Date', 'Desc', 'Amount', 'Balance', 'Ref']], base)).toBe(false)
})

test('bank-statement shape: padded cells, quoted refs, merchant from a reference column, short data rows', () => {
  const h = ['Transaction Date', ' Cheque No/Ref No ', 'Description   ', '   Debit Amount', '  Credit Amount', 'Reference 1   ', 'Reference 2']
  const m: CustomMapping = {
    ...base, headerRow: 0, header: h.map((c) => c.trim()), descriptionCols: [2, 5], idCol: 1,
    amount: { mode: 'split', outCol: 3, inCol: 4 },
  }
  const out = parseCustom([
    h,
    ['01-09-2026', "  '000123'  ", 'PB DEBIT CARD DR     ', '      58.20', '        ', ' VISA4111XXXXXX1111 AIRASIA_D7  '],
    ['02-09-2026', "  '000124'  ", 'CR CYCLE PROFIT      ', '           ', '    1.05'],
  ], m, 2)
  expect(out.map((r) => [r.date, r.kind, r.amount, r.merchantKey])).toEqual([
    ['2026-09-01', 'expense', 5820, 'PB DEBIT CARD DR AIRASIA_D7'],
    ['2026-09-02', 'income', 105, 'CR CYCLE PROFIT'],
  ])
  expect(out[0].rawMerchant).toBe('PB DEBIT CARD DR VISA4111XXXXXX1111 AIRASIA_D7')
  expect(headerMatches([h], m)).toBe(true) // whitespace differences don't break the match
})

test('negative values in split columns are stored as positive amounts', () => {
  const m: CustomMapping = { ...base, amount: { mode: 'split', outCol: 2, inCol: 3 } }
  const [a] = parseCustom(rows(['03/09/2026', 'SHOP', '-35.50', '', '']), m, 2)
  expect([a.kind, a.amount]).toEqual(['expense', 3550])
})

test('dedupe key does not depend on the mapping (re-mapping must not duplicate rows)', () => {
  const data = rows(['03/09/2026', 'SHOP', '-1', '9', 'R1'])
  const k1 = parseCustom(data, base, 2)[0].key
  const k2 = parseCustom(data, { ...base, descriptionCols: [1, 4], idCol: 4, balanceCol: 3 }, 2)[0].key
  expect(k2).toBe(k1)
})

test('trailing summary rows that fail to parse are ignored; a bad row mid-table still throws', () => {
  const ok = ['03/09/2026', 'SHOP', '-1', '', '']
  expect(parseCustom(rows(ok, ['Total 2026-09', '', '-1', '', '']), base, 2)).toHaveLength(1)
  expect(() => parseCustom(rows(['33/09/2026', 'BAD', '-1', '', ''], ok), base, 2)).toThrow('Bad date')
})

test('time comes from the date cell, or from a mapped time column', () => {
  const [a] = parseCustom(rows(['03/09/2026 14:05', 'SHOP', '-1', '', '']), base, 2)
  expect([a.date, a.time]).toEqual(['2026-09-03', '14:05'])
  const [b] = parseCustom(rows(['03/09/2026', 'SHOP', '-1', '', '9:07 PM']), { ...base, timeCol: 4 }, 2)
  expect(b.time).toBe('21:07')
  const [c] = parseCustom(rows(['03/09/2026', 'SHOP', '-1', '', '']), base, 2)
  expect(c.time).toBeUndefined()
})
