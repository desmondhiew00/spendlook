import { expect, test } from 'bun:test'
import { ImportError, parseFile } from './index'

const load = (f: string) => Bun.file(new URL(`./fixtures/${f}`, import.meta.url)).arrayBuffer()

test('MUFG Shift-JIS file into MUFG account', async () => {
  const rows = parseFile(await load('mufg.csv'), 'mufg')
  expect(rows).toHaveLength(1)
  expect(rows[0].merchantKey).toBe('TEST SHOP')
  expect(rows[0].amount).toBe(1200)
})

test('PayPay BOM file into PayPay account', async () => {
  const rows = parseFile(await load('paypay.csv'), 'paypay')
  expect(rows[0].merchantKey).toBe('テスト商店')
})

test('wrong account type is rejected with a specific code', async () => {
  expect(() => parseFile(new ArrayBuffer(0), 'mufg')).toThrow(ImportError)
  try { parseFile(await load('paypay.csv'), 'mufg') } catch (e) { expect((e as ImportError).code).toBe('wrong_type_paypay') }
  try { parseFile(await load('mufg.csv'), 'paypay') } catch (e) { expect((e as ImportError).code).toBe('wrong_type_mufg') }
  expect.assertions(3)
})

test('random CSV is unknown_format', () => {
  const bytes = new TextEncoder().encode('a,b\n1,2\n').buffer as ArrayBuffer
  expect(() => parseFile(bytes, 'paypay')).toThrow('unknown_format')
})
