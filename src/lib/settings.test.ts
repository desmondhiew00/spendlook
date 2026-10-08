import { expect, test } from 'bun:test'
import { keyMatches } from './settings'

test('a key only matches its own provider', () => {
  expect(keyMatches('anthropic', 'sk-ant-api03-x')).toBe(true)
  expect(keyMatches('openai', 'sk-ant-api03-x')).toBe(false)
  expect(keyMatches('google', 'sk-ant-api03-x')).toBe(false)
  expect(keyMatches('openai', 'sk-proj-abc')).toBe(true)
  expect(keyMatches('google', ' AIzaSyX ')).toBe(true)
  expect(keyMatches('anthropic', 'AIzaSyX')).toBe(false)
})
