import type { LanguageModel } from 'ai'
import type { AiSettings } from './settings'

// provider SDKs load on first AI call, and only the chosen one: they're most of the bundle otherwise
export async function makeModel(s: AiSettings): Promise<LanguageModel> {
  switch (s.provider) {
    case 'anthropic': {
      const { createAnthropic } = await import('@ai-sdk/anthropic')
      return createAnthropic({ apiKey: s.apiKey, headers: { 'anthropic-dangerous-direct-browser-access': 'true' } })(s.model)
    }
    case 'google': {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
      return createGoogleGenerativeAI({ apiKey: s.apiKey })(s.model)
    }
    case 'openai': {
      const { createOpenAI } = await import('@ai-sdk/openai')
      return createOpenAI({ apiKey: s.apiKey })(s.model)
    }
  }
}
