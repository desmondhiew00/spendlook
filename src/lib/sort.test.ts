import { expect, test } from 'bun:test'
import { sortRows } from './sort'

test('sortRows: numbers, strings, direction, stability', () => {
  const rows = [
    { n: 2, s: 'b', i: 0 },
    { n: 10, s: 'a', i: 1 },
    { n: 2, s: 'c', i: 2 },
  ]
  expect(sortRows(rows, (r) => r.n, false).map((r) => r.i)).toEqual([0, 2, 1])
  expect(sortRows(rows, (r) => r.n, true).map((r) => r.i)).toEqual([1, 0, 2])
  expect(sortRows(rows, (r) => r.s, false).map((r) => r.s)).toEqual(['a', 'b', 'c'])
  expect(rows[0].i).toBe(0) // input untouched
})
