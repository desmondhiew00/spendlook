# spendlook

Browser-only spending dashboard for bank and e-wallet CSV exports (MUFG and PayPay today). Your data stays in your browser (IndexedDB). AI categorization uses your own Anthropic, Gemini or OpenAI key, and only merchant names are sent.

    bun install
    bun run dev       # local
    bun run test      # unit tests
    bun run i18n      # extract messages → src/locales/*.po
    bun run deploy    # build + wrangler deploy (Cloudflare static assets)
