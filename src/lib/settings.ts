import { open, seal } from './vault'

export type Provider = 'anthropic' | 'google' | 'openai'

export const PROVIDER_LABEL: Record<Provider, string> = { anthropic: 'Anthropic (Claude)', google: 'Google (Gemini)', openai: 'OpenAI' }
export const DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: 'claude-haiku-4-5',
  google: 'gemini-3.5-flash-lite',
  openai: 'gpt-5.4-mini',
}

export interface AiSettings {
  provider: Provider
  model: string
  apiKey: string
  verified: boolean
}

const KEY = 'ai-settings'

export function loadSettings(): AiSettings | null {
  try {
    return JSON.parse(open(localStorage.getItem(KEY)) ?? 'null')
  } catch {
    return null
  }
}

export function saveSettings(s: AiSettings) {
  localStorage.setItem(KEY, seal(JSON.stringify(s)))
}

// Each provider keeps its own key, and a key is only ever sent to the provider whose format it has,
// so switching provider can never hand one company's key to another
const KEY_PATTERN: Record<Provider, RegExp> = { anthropic: /^sk-ant-/, openai: /^sk-(?!ant-)/, google: /^AIza/ }
export const keyMatches = (p: Provider, key: string) => KEY_PATTERN[p].test(key.trim())

const KEYS = 'ai-keys'

export function loadKey(p: Provider): string {
  try {
    const saved = JSON.parse(open(localStorage.getItem(KEYS)) ?? '{}')[p]
    if (saved) return saved
  } catch {}
  const s = loadSettings() // keys saved before per-provider storage
  return s?.provider === p ? s.apiKey : ''
}

export function saveKey(p: Provider, key: string) {
  try {
    localStorage.setItem(KEYS, seal(JSON.stringify({ ...JSON.parse(open(localStorage.getItem(KEYS)) ?? '{}'), [p]: key })))
  } catch {}
}

// Turns AI off: forgets the provider settings and every saved key
export function clearAi() {
  localStorage.removeItem(KEY)
  localStorage.removeItem(KEYS)
}

// Settings hold API keys, so they're encrypted with the data while the vault is on. Read before switching the
// vault on or off, write back after: write seals with whatever the vault is now.
export const readSecrets = () => [KEY, KEYS].map((k) => [k, open(localStorage.getItem(k))] as const)
export function writeSecrets(secrets: ReturnType<typeof readSecrets>) {
  for (const [k, v] of secrets) if (v !== null) localStorage.setItem(k, seal(v))
}
