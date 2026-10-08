import { expect, test } from 'bun:test'

test('indexedDB is available in tests', () => {
  expect(typeof indexedDB.open).toBe('function')
})
