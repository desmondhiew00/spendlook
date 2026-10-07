import { defineConfig } from '@lingui/cli'

export default defineConfig({
  sourceLocale: 'en',
  locales: ['en', 'ja', 'zh'],
  catalogs: [{ path: '<rootDir>/src/locales/{locale}', include: ['src'] }],
})
