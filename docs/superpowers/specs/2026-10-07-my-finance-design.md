# spendlook — Design Spec

Settled in a grilling session on 2026-10-07 (Q1–Q53). Later answers override earlier ones.

## What

Browser-only web app. User uploads MUFG bank and PayPay CSV exports, AI categorizes merchants, and per-account dashboards show spending and income. No backend, no auth, no database server, no data collection. Country-neutral: the goal is Asia-wide banks and e-wallets over time. Future: public free app, same code.

## Stack

- React + Vite SPA, TanStack Router (code-based routes), Bun (package manager, scripts, `bun test`)
- Tailwind + shadcn/ui, Recharts
- Dexie (IndexedDB) + `dexie-react-hooks` `useLiveQuery`
- Vercel AI SDK (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/openai`), `generateText` + `Output.object` + zod
- Lingui (en, ja), via `@lingui/vite-plugin` + babel macro
- Hosting: Cloudflare Workers **static assets only** (`wrangler deploy`, `not_found_handling: "single-page-application"`), CSP in `public/_headers`

## Accounts

- `account = {id, type: 'mufg' | 'paypay', name, currency}`. User can add several accounts of each type. `currency` is ISO 4217 (MUFG/PayPay = JPY). Amounts are integer minor units, formatted with `Intl` in the account currency. No FX conversion.
- Each account page has its own upload button, upload history (with per-upload delete), and a dashboard with **Spending** and **Income** tabs. **No combined view**, and accounts are never summed.

## Import

- The browser reads the file. MUFG is decoded as `shift_jis`, PayPay as UTF-8 (BOM stripped). Native `TextDecoder`.
- The header must match the account type. If it's the other known type: "This looks like a PayPay file, not MUFG." Unknown → reject. Hardcoded parsers only (no AI header detection).
- Dedupe per account: PayPay uses `取引番号`. MUFG uses `date|摘要|摘要内容|out|in|balance`. Re-uploading or overlapping ranges is safe. Shows an "X added, Y skipped" summary.
- Raw files are never stored.
- Upload is disabled until an AI key is saved and verified.

## Row rules

**MUFG**

| Condition | kind | category |
|---|---|---|
| out > 0, merchant contains `ペイペイ` or `PAYPAY` (PayPay top-up, PayPay Card bill) | expense | fixed `paypay` |
| out > 0, otherwise | expense | AI |
| in > 0, 摘要 starts `デビット` (debit refund) | expense, **negative amount** (nets against the charge) | AI (same merchant) |
| in > 0, 摘要 `Ｄ現金還元` | income | fixed `cashback_points` |
| in > 0, 摘要 `利息` | income | fixed `interest` |
| in > 0, otherwise | income | AI |

**PayPay** (`取引内容`)

| Value | kind | category |
|---|---|---|
| 支払い, 請求書払い | expense | AI |
| 返金 | expense, negative | AI |
| 送った金額 | expense | fixed `transfer_out` (recipient name never sent to AI) |
| 受け取った金額 | income | fixed `transfer_in` |
| ポイント、残高の獲得 | income | fixed `cashback_points` |
| チャージ | transfer (hidden, excluded from totals) | — |
| other | expense if out > 0, else income | AI |

## Categories (enum keys, labels via Lingui)

- Spending: `groceries, dining, transport, rent, utilities, phone_internet, shopping, health, entertainment, travel, subscriptions, paypay, transfer_out, other, excluded`
- Income: `salary, cashback_points, transfer_in, interest, other_income, excluded`
- The AI may pick any of these except `paypay`, `transfer_out` and `excluded`.
- `excluded` is set by the user only. Its rows are hidden from totals and charts but still listed in the transaction table. This is how internal transfers get dropped.

Resolution order: transaction override > fixed rule > merchant override > AI > `other` / `other_income`.

## Merchants and AI

- `merchantKey` = NFKC → katakana-context `−` becomes `ー` → strip the 6-digit MUFG debit auth prefix → collapse spaces → uppercase. PayPay uses the part of `取引先` before ` - ` (chain, not branch).
- Merchant record per browser, keyed `${kind}|${merchantKey}`: `{displayName, aiCategory?, confidence?, overrideCategory?, needsReview}`.
- After import, merchants with no `aiCategory` are sent in batches of 50 as `{id, name, kind}`. Only names leave the browser: no amounts, no dates.
- The model returns `{id, display_name, category, confidence}`. If the category is invalid for that kind, or confidence < 0.6, the merchant is flagged needsReview. If the call fails, merchants stay uncategorized and needsReview, the imported rows are kept, and a "Retry categorize" button appears.
- Settings: a provider dropdown (Anthropic / Google / OpenAI) + an editable model field (defaults `claude-haiku-4-5`, `gemini-3.5-flash-lite`, `gpt-5.4-mini`) + the API key in `localStorage` + a "Test key" button. Note: "stored only in this browser, sent only to <provider>".

## Dashboard (per account, per tab)

- Monthly total + month-over-month change (calendar months)
- Stacked bar: by category per month
- Selected month: category breakdown + top merchants (group by merchant)
- Transaction table: filter by month and category, search text, method (PayPay `取引方法`), and a category select (transaction override). Merchant category edits apply to all of that merchant's transactions.
- A needs-review count/filter
- Budgets: none

## Other

- i18n: en/ja. Locale = `localStorage.locale` ?? (`navigator.language` starts with `ja` ? `ja` : `en`), with a toggle. ¥ and dates via `Intl`.
- Backup: an export of the full IndexedDB dump (accounts, uploads, txns, merchants) as JSON, and an import that merges it with `bulkPut`. A banner warns that clearing browser data wipes everything.
- Security: no third-party scripts or analytics. CSP `script-src 'self'`, with `connect-src` limited to the three provider origins.

## v2 (planned, separate plan): Custom CSV import

- New account type `custom` with a user-picked currency.
- Encoding is detected locally: strict UTF-8, then Shift-JIS / Big5 / GBK / EUC-KR, keeping the first with no decode errors.
- The AI receives the header + 3 sample rows (the user is told these rows go to the provider) and returns a mapping: header row index, date column + format, description column, amount mode (one signed column, or separate out/in), optional id/balance columns, currency.
- Confirm screen: a 10-row parsed preview with editable mapping fields. The mapping is saved on the account, reused while the header matches, and re-detected if it changes.
- kind comes from the sign. No rule engine; internal transfers are handled with `excluded`.
- Dedupe: the mapped id column, else `hash(date, description, amount, balance?)` + an occurrence index for identical rows within the same day.
- Mappings stay per browser. Later, community presets can ship as JSON in the repo.
- More locales (zh/ko/th…) are added as `.po` files when needed.
