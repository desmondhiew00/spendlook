import { expect, test } from 'bun:test'
import { normalizeMerchant } from './normalize'

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
