import { expect, test } from 'bun:test'
import { isPersonTransfer, normalizeMerchant } from './normalize'

test('full-width → half-width, strips MUFG debit auth prefix', () => {
  expect(normalizeMerchant('５５３７９９　ＪＲＣ　ＳＨＩＮ')).toBe('JRC SHIN')
  expect(normalizeMerchant('９５４４６０　ＡＭＡＺＯＮ．Ｃ')).toBe('AMAZON.C')
})

test('katakana long-vowel minus becomes ー', () => {
  expect(normalizeMerchant('ＰＡＹＰＡＹカ−ド')).toBe('PAYPAYカード')
})

test('half-width katakana and spacing', () => {
  expect(normalizeMerchant('  ｾﾌﾞﾝ   ｲﾚﾌﾞﾝ ')).toBe('セブン イレブン')
})

test('keeps numbers that are not a 6-digit prefix', () => {
  expect(normalizeMerchant('7-ELEVEN 123')).toBe('7-ELEVEN 123')
})

test('person transfers are recognised; company payers and purchases are not', () => {
  expect(isPersonTransfer('振込 ヤマダ タロウ')).toBe(true)
  expect(isPersonTransfer('DUITNOW TRSF DR AHMAD BIN ALI')).toBe(true)
  expect(isPersonTransfer('FUND TRANSFER TO JOHN TAN')).toBe(true)
  expect(isPersonTransfer('振込 アスカル (カ')).toBe(false)
  expect(isPersonTransfer('IBG TRANSFER ACME SDN BHD')).toBe(false)
  expect(isPersonTransfer('AMAZON.CO.JP')).toBe(false)
  expect(isPersonTransfer('POS PURCHASE TESCO')).toBe(false)
})
