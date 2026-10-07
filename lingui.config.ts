import { defineConfig } from '@lingui/cli'

export default defineConfig({
  sourceLocale: 'en',
  locales: ['en', 'ja'],
  catalogs: [{ path: '<rootDir>/src/locales/{locale}', include: ['src'] }],
})
