export type Provider = 'anthropic' | 'google' | 'openai'

export const PROVIDER_LABEL: Record<Provider, string> = { anthropic: 'Anthropic (Claude)', google: 'Google (Gemini)', openai: 'OpenAI' }
export const DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: 'claude-haiku-4-5',
  google: 'gemini-3.5-flash-lite',
  openai: 'gpt-5.4-mini',
}

export interface AiSettings { provider: Provider; model: string; apiKey: string; verified: boolean }

const KEY = 'ai-settings'

export function loadSettings(): AiSettings | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null')
  } catch {
    return null
  }
}

export function saveSettings(s: AiSettings) {
  localStorage.setItem(KEY, JSON.stringify(s))
}
