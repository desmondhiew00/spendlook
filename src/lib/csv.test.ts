import { expect, test } from 'bun:test'
import { parseCsv, yen } from './csv'

test('quoted commas, escaped quotes, CRLF, trailing newline', () => {
  expect(parseCsv('a,"1,000","say ""hi"""\r\nb,-,\r\n')).toEqual([
    ['a', '1,000', 'say "hi"'],
    ['b', '-', ''],
  ])
})

test('no trailing newline and blank lines skipped', () => {
  expect(parseCsv('x,y\n\nz,w')).toEqual([['x', 'y'], ['z', 'w']])
})

test('yen parses commas, dash, empty', () => {
  expect(yen('10,560')).toBe(10560)
  expect(yen('-')).toBe(0)
  expect(yen('')).toBe(0)
  expect(yen(undefined)).toBe(0)
})

test('yen throws on garbage instead of NaN', () => {
  expect(() => yen('abc')).toThrow('Bad amount')
})
