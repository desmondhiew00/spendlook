import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'
import type { AiSettings } from './settings'

export function makeModel(s: AiSettings): LanguageModel {
  switch (s.provider) {
    case 'anthropic':
      return createAnthropic({ apiKey: s.apiKey, headers: { 'anthropic-dangerous-direct-browser-access': 'true' } })(s.model)
    case 'google':
      return createGoogleGenerativeAI({ apiKey: s.apiKey })(s.model)
    case 'openai':
      return createOpenAI({ apiKey: s.apiKey })(s.model)
  }
}
