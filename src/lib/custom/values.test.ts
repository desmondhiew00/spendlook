import { expect, test } from 'bun:test'
import { fractionDigits, parseDate, parseMinor } from './values'

test('parseMinor gives exact integer minor units', () => {
  expect(parseMinor('1,234.50', 2)).toBe(123450)
  expect(parseMinor('12.5', 2)).toBe(1250)
  expect(parseMinor('0.29', 2)).toBe(29) // 0.29*100 = 28.999… in floats
  expect(parseMinor('¥1,200', 0)).toBe(1200)
  expect(parseMinor('S$ 3.10', 2)).toBe(310)
  expect(parseMinor('(12.50)', 2)).toBe(-1250)
  expect(parseMinor('-7', 2)).toBe(-700)
  expect(parseMinor('', 2)).toBe(0)
  expect(parseMinor('-', 2)).toBe(0)
})

test('parseMinor rejects garbage and too many decimals', () => {
  expect(() => parseMinor('abc', 2)).toThrow('Bad amount')
  expect(() => parseMinor('1.234', 2)).toThrow('Bad amount')
  expect(() => parseMinor('0x10', 0)).toThrow('Bad amount')
})

test('parseDate formats', () => {
  expect(parseDate('2026-09-03', 'YMD')).toBe('2026-09-03')
  expect(parseDate('2026/9/3 10:22', 'YMD')).toBe('2026-09-03')
  expect(parseDate('03/09/2026', 'DMY')).toBe('2026-09-03')
  expect(parseDate('3.9.26', 'DMY')).toBe('2026-09-03')
  expect(parseDate('09/03/2026', 'MDY')).toBe('2026-09-03')
  expect(parseDate('20260903', 'YYYYMMDD')).toBe('2026-09-03')
  expect(parseDate('3 Sep 2026', 'D MMM Y')).toBe('2026-09-03')
  expect(parseDate('03-SEPT-2026', 'D MMM Y')).toBe('2026-09-03')
})

test('parseDate rejects impossible dates', () => {
  expect(() => parseDate('2026-13-01', 'YMD')).toThrow('Bad date')
  expect(() => parseDate('31/02/2026', 'DMY')).toThrow('Bad date')
  expect(() => parseDate('Total', 'YMD')).toThrow('Bad date')
})

test('fractionDigits from Intl', () => {
  expect(fractionDigits('JPY')).toBe(0)
  expect(fractionDigits('SGD')).toBe(2)
})
