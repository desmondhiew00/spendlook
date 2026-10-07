import { expect, test } from 'bun:test'
import { detectDelimiter, detectHeaderRow, sniff } from './sniff'

const load = (f: string) => Bun.file(new URL(`./fixtures/${f}`, import.meta.url)).arrayBuffer()
const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer

test('UTF-8 with BOM, comma, header on row 0', () => {
  const r = sniff(bytes('﻿Date,Payee,Out,In\n2026-09-01,Shop,"1,200",\n'))
  expect([r.encoding, r.delimiter, r.headerRow]).toEqual(['utf-8', ',', 0])
  expect(r.rows[0]).toEqual(['Date', 'Payee', 'Out', 'In'])
})

test('Shift-JIS bytes are detected and decoded', async () => {
  const r = sniff(await load('sjis.csv'))
  expect(r.encoding).toBe('shift_jis')
  expect(r.rows[0]).toEqual(['日付', '摘要', '金額'])
})

test('tab-delimited with a preamble: header row found after it', async () => {
  const r = sniff(await load('tab-preamble.csv'))
  expect(r.delimiter).toBe('\t')
  expect(r.rows[r.headerRow]).toEqual(['Date', 'Description', 'Amount', 'Balance'])
})

test('detectDelimiter prefers the consistent one', () => {
  expect(detectDelimiter('a;b;c\n1;2,5;3\n')).toBe(';')
})

test('detectHeaderRow skips numeric-looking rows of the modal width', () => {
  expect(detectHeaderRow([['Report'], ['2026', '1', '2'], ['Date', 'Desc', 'Amt'], ['2026-01-01', 'x', '1']])).toBe(2)
})
