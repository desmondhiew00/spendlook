import { expect, test } from 'bun:test'
import { type MappingGuess, carryOver, detectDateFormat, guessToMapping, localGuess, sampleForAi } from './ai'

const base = { encoding: 'utf-8' as const, delimiter: ',' as const, headerRow: 2, header: ['Date', 'Description', 'Debit', 'Credit', 'Ref 1', 'Balance'] }
const guess: MappingGuess = {
  dateCol: 0, dateFormat: 'DMY', descriptionCols: [1, 4, 9], amountMode: 'split',
  amountCol: null, negativeIs: null, outCol: 2, inCol: 3, idCol: 12, balanceCol: 5,
}

test('guessToMapping builds the mapping and drops out-of-range optional columns', () => {
  expect(guessToMapping(guess, base)).toEqual({
    ...base, dateCol: 0, dateFormat: 'DMY', descriptionCols: [1, 4],
    amount: { mode: 'split', outCol: 2, inCol: 3 }, idCol: undefined, balanceCol: 5,
  })
})

test('guessToMapping signed mode defaults negativeIs to expense', () => {
  const m = guessToMapping({ ...guess, amountMode: 'signed', amountCol: 2, outCol: null, inCol: null }, base)
  expect(m.amount).toEqual({ mode: 'signed', col: 2, negativeIs: 'expense' })
})

test('localGuess reads common header names (en/ja/zh/ms)', () => {
  expect(localGuess(base)).toMatchObject({ dateCol: 0, descriptionCols: [1], amount: { mode: 'split', outCol: 2, inCol: 3 }, balanceCol: 5 })
  const ja = localGuess({ ...base, header: ['日付', '摘要', '金額'] })
  expect(ja).toMatchObject({ dateCol: 0, descriptionCols: [1], amount: { mode: 'signed', col: 2 } })
  const ms = localGuess({ ...base, header: ['Tarikh', 'Keterangan', 'Debit', 'Kredit'] })
  expect(ms).toMatchObject({ dateCol: 0, descriptionCols: [1], amount: { mode: 'split', outCol: 2, inCol: 3 } })
})

test('sampleForAi sends only the header and 3 data rows, trimmed', () => {
  const rows = [['Account', '123'], ['x'], base.header, ['01-09-2026 ', ' A'], ['b'], ['c'], ['d'], ['e']]
  expect(sampleForAi(rows, 2)).toEqual({ header: base.header, samples: [['01-09-2026', 'A'], ['b'], ['c']] })
})

test('detectDateFormat picks the first format every sample parses with', () => {
  expect(detectDateFormat(['13-09-2026', '01-10-2026'])).toBe('DMY')
  expect(detectDateFormat(['2026/09/13'])).toBe('YMD')
  expect(detectDateFormat(['09/13/2026'])).toBe('MDY')
  expect(detectDateFormat(['nonsense'])).toBe('YMD')
})

test('carryOver remaps a saved mapping onto a changed header by column name', () => {
  const old = { ...guessToMapping(guess, base), descriptionCols: [1, 4] }
  const next = { ...base, header: ['Date', 'Ref 1', 'Description', 'Debit', 'Credit', 'Balance', 'New'] }
  expect(carryOver(old, next)).toMatchObject({ dateCol: 0, descriptionCols: [2, 1], amount: { mode: 'split', outCol: 3, inCol: 4 }, balanceCol: 5, header: next.header })
  expect(carryOver(old, { ...base, header: ['When', 'What', 'How much'] })).toBeNull()
})
