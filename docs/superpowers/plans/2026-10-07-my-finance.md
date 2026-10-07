# spendlook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Browser-only dashboard that imports MUFG and PayPay CSVs, categorizes merchants with the user's own AI key, and shows per-account spending and income.

**Architecture:** A static React SPA. All data lives in IndexedDB (Dexie). Pure parsing, aggregation and categorization logic sits in `src/lib/` with `bun test` coverage. The UI in `src/routes/` and `src/components/` reads through `useLiveQuery`. The only network call is browser → the AI provider the user picked (Vercel AI SDK). Deployed as Cloudflare Workers static assets.

**Tech Stack:** Bun, Vite, React, TypeScript, TanStack Router (code-based), Tailwind v4 + shadcn/ui, Recharts, Dexie + dexie-react-hooks, `ai` + `@ai-sdk/{anthropic,google,openai}` + zod, Lingui (en/ja), wrangler.

**Spec:** `docs/superpowers/specs/2026-10-07-my-finance-design.md`

## Global Constraints

- No backend code, no server, no analytics, no third-party scripts. The only outbound origins are `https://api.anthropic.com`, `https://generativelanguage.googleapis.com`, `https://api.openai.com`.
- Only merchant display names and `kind` are sent to the AI. Never amounts, dates, or `送った金額`/`受け取った金額` counterparties (those are fixed-category).
- Product/repo name: `spendlook`.
- Money: each account has an ISO 4217 `currency`. Amounts are **integer minor units** (JPY = yen). Format with `formatMoney(n, currency, locale)`. No FX; accounts are never summed.
- `data/` holds real bank exports and **must be in `.gitignore` before the first commit**.
- Default models: `anthropic: claude-haiku-4-5`, `google: gemini-3.5-flash-lite`, `openai: gpt-5.4-mini` (user-editable).
- Category keys (exact):
  - Spending `groceries, dining, transport, rent, utilities, phone_internet, shopping, health, entertainment, travel, subscriptions, paypay, transfer_out, other, excluded`
  - Income `salary, cashback_points, transfer_in, interest, other_income, excluded`
  - `excluded` is user-set only (never AI). Its rows are hidden from totals and charts but still listed in the transaction table.
- Resolution order: txn override > fixed rule > merchant override > AI > `other`/`other_income`.
- Low-confidence threshold: `< 0.6` → needsReview. AI batch size: 50.
- Locales: `en` (source), `ja`. Lingui macros only from `@lingui/core/macro` / `@lingui/react/macro`. `src/lib/**` must not import Lingui (it has to run under `bun test` without the macro transform).
- Amounts: integer yen. Refunds are negative `expense`. `transfer` rows are never shown or summed.

## Review Focus

1. **Overlapping or repeated upload of the same export** → zero duplicates, and the summary says "0 added, N skipped". Pinned in Task 5.
2. **PayPay file uploaded into a MUFG account (and vice versa), or a random CSV** → rejected with a specific message, nothing written. Pinned in Task 4.
3. **AI call throws, omits ids, returns a category invalid for the kind, or returns low confidence** → imported rows are kept, the merchant is flagged needsReview, and retry works. Pinned in Task 7.
4. **Debit refund in a later month than the charge** → that month's net goes down (can go negative), no crash. Pinned in Task 3 (parser) and Task 6 (aggregate).
5. **Amount strings `"10,560"`, `-`, empty, BOM, CRLF line endings, quoted commas** → parsed exactly. Garbage amounts throw instead of becoming NaN. Pinned in Task 3.

## File Structure

```
.gitignore  bunfig.toml  package.json  vite.config.ts  tsconfig*.json  lingui.config.ts  wrangler.jsonc  index.html
public/_headers                       CSP + security headers (prod)
src/main.tsx                          bootstrap: I18nProvider + RouterProvider
src/router.tsx                        route tree + root layout
src/i18n.ts                           locale detect/activate
src/po.d.ts                           *.po module typing
src/locales/{en,ja}.po                catalogs
src/lib/types.ts                      domain types + category lists
src/lib/normalize.ts                  merchant key normalization
src/lib/csv.ts                        csv parser, yen(), decode()
src/lib/parse/mufg.ts                 MUFG rows → ParsedRow
src/lib/parse/paypay.ts               PayPay rows → ParsedRow
src/lib/parse/index.ts                parseFile(bytes, type) + ImportError
src/lib/db.ts                         Dexie schema
src/lib/importer.ts                   importRows, deleteUpload, deleteAccount
src/lib/aggregate.ts                  resolveCategory + totals
src/lib/categorize.ts                 AI schema/prompt, applyResult, categorizePending
src/lib/settings.ts                   AI settings in localStorage
src/lib/model.ts                      provider → AI SDK LanguageModel (UI-only, untested)
src/lib/backup.ts                     export/import JSON
src/lib/format.ts                     Intl yen/month formatting
src/components/category-label.ts      Lingui msg descriptors for categories
src/components/category-select.tsx
src/components/locale-toggle.tsx
src/components/upload-panel.tsx
src/components/dashboard.tsx
src/routes/accounts.tsx  src/routes/account.tsx  src/routes/settings.tsx
src/**/*.test.ts                      bun tests next to code
src/lib/parse/fixtures/               synthetic CSV fixtures (never real data)
```

---

### Task 1: Scaffold project

**Files:**
- Create: everything from the Vite `react-ts` template, `.gitignore` (modify), `bunfig.toml`, `wrangler.jsonc`, `public/_headers`, `src/smoke.test.ts`
- Modify: `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `package.json` scripts

**Interfaces:**
- Produces: `@/` path alias → `src/`, `bun run test`, `bun run build`, shadcn components in `src/components/ui/` (`button`, `card`, `input`, `table`, `tabs`, `badge`).

- [ ] **Step 1: Generate Vite app into a temp dir and move it in** (the project root already has `data/` and `docs/`)

```bash
cd /Users/hiewdesmond/Workspace/personal/my-finance
bunx create-vite@latest scaffold --template react-ts --no-interactive   # drop --no-interactive if the flag is unknown; answer "No" to any "install/start now" prompt
cp -R scaffold/. . && rm -rf scaffold
```

- [ ] **Step 2: Protect bank data before git exists**

Append to `.gitignore`:

```
data/
*.csv
!src/lib/parse/fixtures/*.csv
.wrangler/
```

Then:

```bash
git init && git status --short | grep -E '^\?\? data' && echo "LEAK" || echo "ok: data ignored"
```

Expected: `ok: data ignored`

- [ ] **Step 3: Install deps**

```bash
bun install
bun add -d tailwindcss @tailwindcss/vite @types/node wrangler fake-indexeddb
bun add @tanstack/react-router dexie dexie-react-hooks recharts zod ai @ai-sdk/anthropic @ai-sdk/google @ai-sdk/openai
```

- [ ] **Step 4: Tailwind + alias.** Replace `vite.config.ts`:

```ts
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
```

Replace `src/index.css` with `@import "tailwindcss";`. In both `tsconfig.json` and `tsconfig.app.json`, add to `compilerOptions`:

```json
"baseUrl": ".",
"paths": { "@/*": ["./src/*"] }
```

(`tsconfig.json` has only `files`/`references` in the template, so add a `compilerOptions` object holding just those two keys.) Also add `"exclude": ["src/**/*.test.ts"]` to `tsconfig.app.json` so `tsc -b` skips bun test files.

- [ ] **Step 5: shadcn**

```bash
bunx shadcn@latest init -d
bunx shadcn@latest add -y button card input table tabs badge
```

Expected: `src/components/ui/{button,card,input,table,tabs,badge}.tsx` and `src/lib/utils.ts` exist.

- [ ] **Step 6: Test runner + scripts.** Create `bunfig.toml`:

```toml
[test]
preload = ["fake-indexeddb/auto"]
```

In `package.json` `scripts`, add:

```json
"test": "bun test src",
"deploy": "bun run build && wrangler deploy"
```

Create `src/smoke.test.ts`:

```ts
import { expect, test } from 'bun:test'

test('indexedDB is available in tests', () => {
  expect(typeof indexedDB.open).toBe('function')
})
```

- [ ] **Step 7: Hosting config.** Create `wrangler.jsonc`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "spendlook",
  "compatibility_date": "2026-10-07",
  "assets": { "directory": "./dist", "not_found_handling": "single-page-application" }
}
```

Create `public/_headers`:

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.anthropic.com https://generativelanguage.googleapis.com https://api.openai.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
```

- [ ] **Step 8: Verify**

Run: `bun run test && bun run build`
Expected: 1 pass. Build succeeds and `dist/_headers` exists.

- [ ] **Step 9: Commit**

```bash
git add -A && git status --short | grep -c data/ ; git commit -m "chore: scaffold vite react app with tailwind, shadcn, wrangler"
```

(The grep count must print `0`.)

---

### Task 2: Domain types + merchant normalization

**Files:**
- Create: `src/lib/types.ts`, `src/lib/normalize.ts`
- Test: `src/lib/normalize.test.ts`

**Interfaces:**
- Produces: all types below, `merchantId(kind, key)`, `normalizeMerchant(raw: string): string`.

- [ ] **Step 1: Write `src/lib/types.ts`** (types only, no test needed)

```ts
export const SPENDING = [
  'groceries', 'dining', 'transport', 'rent', 'utilities', 'phone_internet', 'shopping',
  'health', 'entertainment', 'travel', 'subscriptions', 'paypay', 'transfer_out', 'other', 'excluded',
] as const
export const INCOME = ['salary', 'cashback_points', 'transfer_in', 'interest', 'other_income', 'excluded'] as const
// AI may not assign rule-only or user-only categories (paypay, transfer_out, excluded)
export const AI_SPENDING = [
  'groceries', 'dining', 'transport', 'rent', 'utilities', 'phone_internet', 'shopping',
  'health', 'entertainment', 'travel', 'subscriptions', 'other',
] as const
export const AI_INCOME = ['salary', 'cashback_points', 'transfer_in', 'interest', 'other_income'] as const

export type SpendingCategory = (typeof SPENDING)[number]
export type IncomeCategory = (typeof INCOME)[number]
export type Category = SpendingCategory | IncomeCategory

export type AccountType = 'mufg' | 'paypay'
export type Kind = 'expense' | 'income' | 'transfer'
export type Flow = Exclude<Kind, 'transfer'>

export interface Account { id: string; type: AccountType; name: string; currency: string; createdAt: number }

export interface ParsedRow {
  key: string // dedupe key within an account
  date: string // YYYY-MM-DD
  kind: Kind
  amount: number // integer minor units of account currency (JPY = yen); negative = refund
  rawMerchant: string
  merchantKey: string
  method?: string
  fixedCategory?: Category
}

export interface Txn extends ParsedRow {
  id: string // `${accountId}:${key}`
  accountId: string
  uploadId: string
  month: string // YYYY-MM
  overrideCategory?: Category
}

export interface Merchant {
  id: string // merchantId(kind, merchantKey)
  kind: Flow
  merchantKey: string
  displayName: string
  aiCategory?: Category
  confidence?: number
  overrideCategory?: Category
  needsReview: boolean
}

export interface Upload { id: string; accountId: string; fileName: string; createdAt: number; added: number; skipped: number }

export const merchantId = (kind: Flow, merchantKey: string) => `${kind}|${merchantKey}`
```

- [ ] **Step 2: Write the failing test** `src/lib/normalize.test.ts`

```ts
import { expect, test } from 'bun:test'
import { normalizeMerchant } from './normalize'

test('full-width → half-width, strips MUFG debit auth prefix', () => {
  expect(normalizeMerchant('５５３７９９　ＪＲＣ　ＳＨＩＮ')).toBe('JRC SHIN')
  expect(normalizeMerchant('９５４４６０　ＡＭＡＺＯＮ．Ｃ')).toBe('AMAZON.C')
})

test('katakana long-vowel minus becomes ー', () => {
  expect(normalizeMerchant('ＰＡＹＰＡＹカ−ド')).toBe('PAYPAYカード')
})

test('half-width katakana and spacing', () => {
  expect(normalizeMerchant('  ｾﾌﾞﾝ   ｲﾚﾌﾞﾝ ')).toBe('セブン イレブン')
})

test('keeps numbers that are not a 6-digit prefix', () => {
  expect(normalizeMerchant('7-ELEVEN 123')).toBe('7-ELEVEN 123')
})
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `bun test src/lib/normalize.test.ts`
Expected: FAIL, cannot find module `./normalize`

- [ ] **Step 4: Implement** `src/lib/normalize.ts`

```ts
export function normalizeMerchant(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/(?<=[゠-ヿ])[−\-]/g, 'ー') // MUFG writes カ−ド with U+2212
    .replace(/^\d{6}\s+/, '') // MUFG debit authorization number
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `bun test src/lib/normalize.test.ts`
Expected: 4 pass

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/normalize.ts src/lib/normalize.test.ts
git commit -m "feat: domain types and merchant normalization"
```

---

### Task 3: CSV utilities + MUFG parser

**Files:**
- Create: `src/lib/csv.ts`, `src/lib/parse/mufg.ts`
- Test: `src/lib/csv.test.ts`, `src/lib/parse/mufg.test.ts`

**Interfaces:**
- Consumes: `ParsedRow`, `normalizeMerchant`
- Produces: `parseCsv(text): string[][]`, `yen(s?): number`, `decode(bytes: ArrayBuffer, enc: 'shift_jis' | 'utf-8'): string`, `isMufg(rows): boolean`, `parseMufg(rows): ParsedRow[]`

- [ ] **Step 1: Write the failing CSV test** `src/lib/csv.test.ts`

```ts
import { expect, test } from 'bun:test'
import { parseCsv, yen } from './csv'

test('quoted commas, escaped quotes, CRLF, trailing newline', () => {
  expect(parseCsv('a,"1,000","say ""hi"""\r\nb,-,\r\n')).toEqual([
    ['a', '1,000', 'say "hi"'],
    ['b', '-', ''],
  ])
})

test('no trailing newline and blank lines skipped', () => {
  expect(parseCsv('x,y\n\nz,w')).toEqual([['x', 'y'], ['z', 'w']])
})

test('yen parses commas, dash, empty', () => {
  expect(yen('10,560')).toBe(10560)
  expect(yen('-')).toBe(0)
  expect(yen('')).toBe(0)
  expect(yen(undefined)).toBe(0)
})

test('yen throws on garbage instead of NaN', () => {
  expect(() => yen('abc')).toThrow('Bad amount')
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `bun test src/lib/csv.test.ts` → FAIL (module missing)

- [ ] **Step 3: Implement** `src/lib/csv.ts`

```ts
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const endRow = () => {
    row.push(field)
    if (row.length > 1 || row[0] !== '') rows.push(row)
    row = []
    field = ''
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c !== '"') field += c
      else if (text[i + 1] === '"') { field += '"'; i++ }
      else quoted = false
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') endRow()
    else if (c !== '\r') field += c
  }
  if (field !== '' || row.length) endRow()
  return rows
}

export function yen(s: string | undefined): number {
  const t = (s ?? '').replace(/[,\s]/g, '')
  if (t === '' || t === '-') return 0
  const n = Number(t)
  if (!Number.isFinite(n)) throw new Error(`Bad amount: ${s}`)
  return n
}

export function decode(bytes: ArrayBuffer, encoding: 'shift_jis' | 'utf-8'): string {
  return new TextDecoder(encoding).decode(bytes).replace(/^﻿/, '')
}
```

- [ ] **Step 4: Run** `bun test src/lib/csv.test.ts` → 4 pass

- [ ] **Step 5: Write the failing MUFG test** `src/lib/parse/mufg.test.ts`

```ts
import { expect, test } from 'bun:test'
import { isMufg, parseMufg } from './mufg'

const H = ['日付', '摘要', '摘要内容', '支払い金額', '預かり金額', '差引残高', 'メモ', '未資金化区分', '入払区分']
const r = (...cells: string[]) => [...cells, '', '', '']

test('detects header', () => {
  expect(isMufg([H])).toBe(true)
  expect(isMufg([['取引日', '出金金額（円）']])).toBe(false)
})

test('maps every MUFG row kind', () => {
  const rows = parseMufg([
    H,
    r('2026/7/2', 'デビット１', '５５３７９９　ＪＲＣ　ＳＨＩＮ', '10,560', '', '467,152'),
    r('2026/7/3', '口座振替', 'ＲＴＫ　ペイペイ', '5,000', '', '462,152'),
    r('2026/8/18', 'デビット３', '５５３７９９　ＪＲＣ　ＳＨＩＮ', '', '10,560', '472,712'),
    r('2026/7/24', '振込１', 'アスカル　（カ', '', '299,536', '772,248'),
    r('2026/7/27', 'Ｄ現金還元', '８ネン　６ガツブン', '', '734', '772,982'),
    r('2026/8/17', '利息', 'ス−パ−フツウ', '', '485', '773,467'),
  ])
  expect(rows.map((x) => [x.date, x.kind, x.amount, x.merchantKey, x.fixedCategory])).toEqual([
    ['2026-07-02', 'expense', 10560, 'JRC SHIN', undefined],
    ['2026-07-03', 'expense', 5000, 'RTK ペイペイ', 'paypay'],
    ['2026-08-18', 'expense', -10560, 'JRC SHIN', undefined], // refund nets against charge
    ['2026-07-24', 'income', 299536, 'アスカル (カ', undefined],
    ['2026-07-27', 'income', 734, '8ネン 6ガツブン', 'cashback_points'],
    ['2026-08-17', 'income', 485, 'スーパーフツウ', 'interest'],
  ])
})

test('dedupe key differs for same-day identical charges (balance differs)', () => {
  const [a, b] = parseMufg([
    H,
    r('2026/7/2', 'デビット１', 'X', '100', '', '900'),
    r('2026/7/2', 'デビット１', 'X', '100', '', '800'),
  ])
  expect(a.key).not.toBe(b.key)
})

test('empty 摘要内容 falls back to 摘要 as merchant', () => {
  const [row] = parseMufg([H, r('2026/9/1', 'カ−ド', '', '20,000', '', '1')])
  expect(row.merchantKey).toBe('カード')
})
```

- [ ] **Step 6: Run** `bun test src/lib/parse/mufg.test.ts` → FAIL

- [ ] **Step 7: Implement** `src/lib/parse/mufg.ts`

```ts
import { yen } from '../csv'
import { normalizeMerchant } from '../normalize'
import type { ParsedRow } from '../types'

const HEADER = ['日付', '摘要', '摘要内容', '支払い金額', '預かり金額', '差引残高']

export const isMufg = (rows: string[][]) => HEADER.every((h, i) => rows[0]?.[i] === h)

export function parseMufg(rows: string[][]): ParsedRow[] {
  return rows.slice(1).map(([d, tekiyo, content, outS, inS, balance]): ParsedRow => {
    const out = yen(outS)
    const inn = yen(inS)
    const [y, m, day] = d.split('/')
    const rawMerchant = content || tekiyo
    const merchantKey = normalizeMerchant(rawMerchant)
    const type = normalizeMerchant(tekiyo)
    const base = {
      key: [d, tekiyo, content, outS, inS, balance].join('|'),
      date: `${y}-${m.padStart(2, '0')}-${day.padStart(2, '0')}`,
      rawMerchant,
      merchantKey,
    }
    if (out > 0) {
      return { ...base, kind: 'expense', amount: out, fixedCategory: /ペイペイ|PAYPAY/.test(merchantKey) ? 'paypay' : undefined }
    }
    if (type.startsWith('デビット')) return { ...base, kind: 'expense', amount: -inn }
    if (type === 'D現金還元') return { ...base, kind: 'income', amount: inn, fixedCategory: 'cashback_points' }
    if (type === '利息') return { ...base, kind: 'income', amount: inn, fixedCategory: 'interest' }
    return { ...base, kind: 'income', amount: inn }
  })
}
```

- [ ] **Step 8: Run** `bun test src/lib` → all pass

- [ ] **Step 9: Commit**

```bash
git add src/lib/csv.ts src/lib/csv.test.ts src/lib/parse/mufg.ts src/lib/parse/mufg.test.ts
git commit -m "feat: csv utilities and MUFG parser"
```

---

### Task 4: PayPay parser + file detection

**Files:**
- Create: `src/lib/parse/paypay.ts`, `src/lib/parse/index.ts`, `src/lib/parse/fixtures/mufg.csv` (Shift-JIS), `src/lib/parse/fixtures/paypay.csv`
- Test: `src/lib/parse/paypay.test.ts`, `src/lib/parse/index.test.ts`

**Interfaces:**
- Consumes: `parseCsv`, `yen`, `decode`, `isMufg`, `parseMufg`
- Produces: `isPaypay(rows)`, `parsePaypay(rows)`, `class ImportError extends Error { code: 'wrong_type_mufg' | 'wrong_type_paypay' | 'unknown_format' }`, `parseFile(bytes: ArrayBuffer, type: AccountType): ParsedRow[]`

- [ ] **Step 1: Write the failing PayPay test** `src/lib/parse/paypay.test.ts`

```ts
import { expect, test } from 'bun:test'
import { isPaypay, parsePaypay } from './paypay'

const H = ['取引日', '出金金額（円）', '入金金額（円）', '海外出金金額', '通貨', '変換レート（円）', '利用国', '取引内容', '取引先', '取引方法', '支払い区分', '利用者', '取引番号']
const r = (date: string, out: string, inn: string, type: string, party: string, method: string, id: string) =>
  [date, out, inn, '-', '-', '-', '-', type, party, method, '-', '-', id]

test('detects header', () => {
  expect(isPaypay([H])).toBe(true)
  expect(isPaypay([['日付', '摘要']])).toBe(false)
})

test('maps every PayPay type', () => {
  const rows = parsePaypay([
    H,
    r('2026/10/01 16:39:18', '648', '-', '支払い', 'マルエツ - マルエツ所沢御幸町店', 'クレジット VISA 7949', 'a1'),
    r('2026/10/01 21:43:04', '3,860', '-', '請求書払い', '所沢市上下水道局', 'PayPay残高', 'a2'),
    r('2026/09/02 10:00:00', '-', '500', '返金', 'Steam', 'PayPay残高', 'a3'),
    r('2026/09/03 10:00:00', '1,000', '-', '送った金額', '山田 太郎', 'PayPay残高', 'a4'),
    r('2026/09/04 10:00:00', '-', '2,000', '受け取った金額', '山田 太郎', 'PayPay残高', 'a5'),
    r('2026/09/06 21:41:30', '-', '3', 'ポイント、残高の獲得', 'マルエツ', 'PayPayポイント', 'a6'),
    r('2026/10/01 21:43:02', '-', '5,000', 'チャージ', 'PayPay', '三菱ＵＦＪ銀行 *****11', 'a7'),
  ])
  expect(rows.map((x) => [x.key, x.date, x.kind, x.amount, x.merchantKey, x.fixedCategory])).toEqual([
    ['a1', '2026-10-01', 'expense', 648, 'マルエツ', undefined],
    ['a2', '2026-10-01', 'expense', 3860, '所沢市上下水道局', undefined],
    ['a3', '2026-09-02', 'expense', -500, 'STEAM', undefined],
    ['a4', '2026-09-03', 'expense', 1000, '山田 太郎', 'transfer_out'],
    ['a5', '2026-09-04', 'income', 2000, '山田 太郎', 'transfer_in'],
    ['a6', '2026-09-06', 'income', 3, 'マルエツ', 'cashback_points'],
    ['a7', '2026-10-01', 'transfer', 5000, 'PAYPAY', undefined],
  ])
  expect(rows[0].rawMerchant).toBe('マルエツ - マルエツ所沢御幸町店')
  expect(rows[0].method).toBe('クレジット VISA 7949')
})

test('unknown type falls back on direction', () => {
  const [a, b] = parsePaypay([H, r('2026/09/01 00:00:00', '10', '-', '新種', 'X', '-', 'u1'), r('2026/09/01 00:00:00', '-', '10', '新種', 'Y', '-', 'u2')])
  expect([a.kind, b.kind]).toEqual(['expense', 'income'])
})
```

- [ ] **Step 2: Run** `bun test src/lib/parse/paypay.test.ts` → FAIL

- [ ] **Step 3: Implement** `src/lib/parse/paypay.ts`

```ts
import { yen } from '../csv'
import { normalizeMerchant } from '../normalize'
import type { ParsedRow } from '../types'

const HEADER = ['取引日', '出金金額（円）', '入金金額（円）']

export const isPaypay = (rows: string[][]) => HEADER.every((h, i) => rows[0]?.[i] === h)

export function parsePaypay(rows: string[][]): ParsedRow[] {
  const header = rows[0]
  const col = (r: string[], name: string) => r[header.indexOf(name)] ?? ''
  return rows.slice(1).map((r): ParsedRow => {
    const out = yen(col(r, '出金金額（円）'))
    const inn = yen(col(r, '入金金額（円）'))
    const party = col(r, '取引先')
    const base = {
      key: col(r, '取引番号'),
      date: col(r, '取引日').slice(0, 10).replaceAll('/', '-'),
      rawMerchant: party,
      merchantKey: normalizeMerchant(party.split(' - ')[0]), // chain, not branch
      method: col(r, '取引方法'),
    }
    switch (col(r, '取引内容')) {
      case '支払い':
      case '請求書払い':
        return { ...base, kind: 'expense', amount: out }
      case '返金':
        return { ...base, kind: 'expense', amount: -inn }
      case '送った金額':
        return { ...base, kind: 'expense', amount: out, fixedCategory: 'transfer_out' }
      case '受け取った金額':
        return { ...base, kind: 'income', amount: inn, fixedCategory: 'transfer_in' }
      case 'ポイント、残高の獲得':
        return { ...base, kind: 'income', amount: inn, fixedCategory: 'cashback_points' }
      case 'チャージ':
        return { ...base, kind: 'transfer', amount: inn }
      default:
        return out > 0 ? { ...base, kind: 'expense', amount: out } : { ...base, kind: 'income', amount: inn }
    }
  })
}
```

- [ ] **Step 4: Run** `bun test src/lib/parse/paypay.test.ts` → 3 pass

- [ ] **Step 5: Create synthetic fixtures** (never copy real `data/` files)

```bash
cd /Users/hiewdesmond/Workspace/personal/my-finance
mkdir -p src/lib/parse/fixtures
printf '"日付","摘要","摘要内容","支払い金額","預かり金額","差引残高","メモ","未資金化区分","入払区分"\r\n"2026/7/2","デビット１","１２３４５６　ＴＥＳＴ　ＳＨＯＰ","1,200","","98,800","","","振替支払い"\r\n' \
  | iconv -f UTF-8 -t SHIFT_JIS > src/lib/parse/fixtures/mufg.csv
printf '\xEF\xBB\xBF取引日,出金金額（円）,入金金額（円）,海外出金金額,通貨,変換レート（円）,利用国,取引内容,取引先,取引方法,支払い区分,利用者,取引番号\n2026/10/01 16:39:18,648,-,-,-,-,-,支払い,テスト商店 - 本店,PayPay残高,-,-,0001\n' \
  > src/lib/parse/fixtures/paypay.csv
```

- [ ] **Step 6: Write the failing detection test** `src/lib/parse/index.test.ts`

```ts
import { expect, test } from 'bun:test'
import { ImportError, parseFile } from './index'

const load = (f: string) => Bun.file(new URL(`./fixtures/${f}`, import.meta.url)).arrayBuffer()

test('MUFG Shift-JIS file into MUFG account', async () => {
  const rows = parseFile(await load('mufg.csv'), 'mufg')
  expect(rows).toHaveLength(1)
  expect(rows[0].merchantKey).toBe('TEST SHOP')
  expect(rows[0].amount).toBe(1200)
})

test('PayPay BOM file into PayPay account', async () => {
  const rows = parseFile(await load('paypay.csv'), 'paypay')
  expect(rows[0].merchantKey).toBe('テスト商店')
})

test('wrong account type is rejected with a specific code', async () => {
  expect(() => parseFile(new ArrayBuffer(0), 'mufg')).toThrow(ImportError)
  try { parseFile(await load('paypay.csv'), 'mufg') } catch (e) { expect((e as ImportError).code).toBe('wrong_type_paypay') }
  try { parseFile(await load('mufg.csv'), 'paypay') } catch (e) { expect((e as ImportError).code).toBe('wrong_type_mufg') }
  expect.assertions(3)
})

test('random CSV is unknown_format', () => {
  const bytes = new TextEncoder().encode('a,b\n1,2\n').buffer as ArrayBuffer
  expect(() => parseFile(bytes, 'paypay')).toThrow('unknown_format')
})
```

- [ ] **Step 7: Run** `bun test src/lib/parse/index.test.ts` → FAIL

- [ ] **Step 8: Implement** `src/lib/parse/index.ts`

```ts
import { decode, parseCsv } from '../csv'
import type { AccountType, ParsedRow } from '../types'
import { isMufg, parseMufg } from './mufg'
import { isPaypay, parsePaypay } from './paypay'

export type ImportErrorCode = 'wrong_type_mufg' | 'wrong_type_paypay' | 'unknown_format'

export class ImportError extends Error {
  constructor(public code: ImportErrorCode) {
    super(code)
  }
}

export function parseFile(bytes: ArrayBuffer, type: AccountType): ParsedRow[] {
  const sjis = parseCsv(decode(bytes, 'shift_jis'))
  const utf8 = parseCsv(decode(bytes, 'utf-8'))
  if (type === 'mufg' && isMufg(sjis)) return parseMufg(sjis)
  if (type === 'paypay' && isPaypay(utf8)) return parsePaypay(utf8)
  if (isPaypay(utf8)) throw new ImportError('wrong_type_paypay')
  if (isMufg(sjis)) throw new ImportError('wrong_type_mufg')
  throw new ImportError('unknown_format')
}
```

- [ ] **Step 9: Run** `bun test src/lib` → all pass

- [ ] **Step 10: Commit**

```bash
git add src/lib/parse
git commit -m "feat: PayPay parser and file type detection"
```

---

### Task 5: Dexie DB + importer

**Files:**
- Create: `src/lib/db.ts`, `src/lib/importer.ts`
- Test: `src/lib/importer.test.ts`

**Interfaces:**
- Consumes: `Account, ParsedRow, Txn, Merchant, Upload, merchantId`
- Produces: `db` (tables `accounts`, `uploads`, `txns`, `merchants`), `importRows(account, fileName, rows): Promise<Upload>`, `deleteUpload(id): Promise<void>`, `deleteAccount(id): Promise<void>`

- [ ] **Step 1: Write `src/lib/db.ts`**

```ts
import Dexie, { type EntityTable } from 'dexie'
import type { Account, Merchant, Txn, Upload } from './types'

export const db = new Dexie('spendlook') as Dexie & {
  accounts: EntityTable<Account, 'id'>
  uploads: EntityTable<Upload, 'id'>
  txns: EntityTable<Txn, 'id'>
  merchants: EntityTable<Merchant, 'id'>
}

db.version(1).stores({
  accounts: 'id',
  uploads: 'id, accountId',
  txns: 'id, accountId, uploadId',
  merchants: 'id',
})
```

- [ ] **Step 2: Write the failing test** `src/lib/importer.test.ts`

```ts
import { beforeEach, expect, test } from 'bun:test'
import { db } from './db'
import { deleteAccount, deleteUpload, importRows } from './importer'
import type { Account, ParsedRow } from './types'

const acct: Account = { id: 'A', type: 'paypay', name: 'PayPay', currency: 'JPY', createdAt: 0 }
const row = (key: string, extra: Partial<ParsedRow> = {}): ParsedRow => ({
  key, date: '2026-09-01', kind: 'expense', amount: 100, rawMerchant: 'Shop - 1', merchantKey: 'SHOP', ...extra,
})

beforeEach(async () => {
  await db.delete()
  await db.open()
})

test('imports rows and creates pending merchants only for AI-categorized rows', async () => {
  const u = await importRows(acct, 'f.csv', [
    row('1'),
    row('2', { kind: 'income', fixedCategory: 'cashback_points' }),
    row('3', { kind: 'transfer' }),
  ])
  expect([u.added, u.skipped]).toEqual([3, 0])
  const t = await db.txns.get('A:1')
  expect(t?.month).toBe('2026-09')
  expect(t?.uploadId).toBe(u.id)
  expect(await db.merchants.toArray()).toEqual([
    { id: 'expense|SHOP', kind: 'expense', merchantKey: 'SHOP', displayName: 'Shop - 1', needsReview: false },
  ])
})

test('re-importing overlapping rows skips duplicates, including duplicates within one file', async () => {
  await importRows(acct, 'a.csv', [row('1'), row('2')])
  const u = await importRows(acct, 'b.csv', [row('2'), row('3'), row('3')])
  expect([u.added, u.skipped]).toEqual([1, 2])
  expect(await db.txns.count()).toBe(3)
})

test('existing merchant (with AI category) is not reset by a new import', async () => {
  await importRows(acct, 'a.csv', [row('1')])
  await db.merchants.update('expense|SHOP', { aiCategory: 'groceries' })
  await importRows(acct, 'b.csv', [row('9')])
  expect((await db.merchants.get('expense|SHOP'))?.aiCategory).toBe('groceries')
})

test('same key in another account is not a duplicate', async () => {
  await importRows(acct, 'a.csv', [row('1')])
  const u = await importRows({ ...acct, id: 'B' }, 'a.csv', [row('1')])
  expect(u.added).toBe(1)
})

test('deleteUpload removes only that upload’s rows', async () => {
  const a = await importRows(acct, 'a.csv', [row('1')])
  await importRows(acct, 'b.csv', [row('2')])
  await deleteUpload(a.id)
  expect((await db.txns.toArray()).map((t) => t.key)).toEqual(['2'])
  expect(await db.uploads.count()).toBe(1)
})

test('deleteAccount removes account, uploads, txns', async () => {
  await db.accounts.add(acct)
  await importRows(acct, 'a.csv', [row('1')])
  await deleteAccount('A')
  expect([await db.accounts.count(), await db.uploads.count(), await db.txns.count()]).toEqual([0, 0, 0])
})
```

- [ ] **Step 3: Run** `bun test src/lib/importer.test.ts` → FAIL

- [ ] **Step 4: Implement** `src/lib/importer.ts`

```ts
import { db } from './db'
import { type Account, type Flow, type Merchant, type ParsedRow, type Txn, type Upload, merchantId } from './types'

export async function importRows(account: Account, fileName: string, rows: ParsedRow[]): Promise<Upload> {
  const uploadId = crypto.randomUUID()
  const txns: Txn[] = rows.map((r) => ({ ...r, id: `${account.id}:${r.key}`, accountId: account.id, uploadId, month: r.date.slice(0, 7) }))

  return db.transaction('rw', db.txns, db.uploads, db.merchants, async () => {
    const existing = await db.txns.bulkGet(txns.map((t) => t.id))
    const seen = new Set<string>()
    const fresh: Txn[] = []
    txns.forEach((t, i) => {
      if (existing[i] || seen.has(t.id)) return
      seen.add(t.id)
      fresh.push(t)
    })
    await db.txns.bulkAdd(fresh)

    const candidates = new Map<string, Merchant>()
    for (const t of fresh) {
      if (t.kind === 'transfer' || t.fixedCategory) continue
      const id = merchantId(t.kind as Flow, t.merchantKey)
      if (!candidates.has(id)) {
        candidates.set(id, { id, kind: t.kind as Flow, merchantKey: t.merchantKey, displayName: t.rawMerchant, needsReview: false })
      }
    }
    const known = await db.merchants.bulkGet([...candidates.keys()])
    await db.merchants.bulkAdd([...candidates.values()].filter((_, i) => !known[i]))

    const upload: Upload = { id: uploadId, accountId: account.id, fileName, createdAt: Date.now(), added: fresh.length, skipped: txns.length - fresh.length }
    await db.uploads.add(upload)
    return upload
  })
}

export async function deleteUpload(id: string) {
  await db.transaction('rw', db.txns, db.uploads, async () => {
    await db.txns.where('uploadId').equals(id).delete()
    await db.uploads.delete(id)
  })
}

export async function deleteAccount(id: string) {
  await db.transaction('rw', db.accounts, db.uploads, db.txns, async () => {
    await db.txns.where('accountId').equals(id).delete()
    await db.uploads.where('accountId').equals(id).delete()
    await db.accounts.delete(id)
  })
}
```

- [ ] **Step 5: Run** `bun test src/lib` → all pass

- [ ] **Step 6: Commit**

```bash
git add src/lib/db.ts src/lib/importer.ts src/lib/importer.test.ts
git commit -m "feat: IndexedDB schema and deduping importer"
```

---

### Task 6: Category resolution + aggregates

**Files:**
- Create: `src/lib/aggregate.ts`
- Test: `src/lib/aggregate.test.ts`

**Interfaces:**
- Consumes: `Txn, Merchant, Category, merchantId`
- Produces:
  - `resolveCategory(t: Txn, merchants: Map<string, Merchant>): Category`
  - `monthlyTotals(txns): {month: string; total: number}[]` (ascending)
  - `byCategoryMonth(txns, resolve): {rows: ({month: string} & Partial<Record<Category, number>>)[]; categories: Category[]}`
  - `categoryTotals(txns, resolve): {category: Category; total: number}[]` (descending)
  - `merchantTotals(txns, merchants): {id: string; name: string; total: number; count: number}[]` (descending)
  - All take txns **already filtered** to one flow (and month where relevant).

- [ ] **Step 1: Write the failing test** `src/lib/aggregate.test.ts`

```ts
import { expect, test } from 'bun:test'
import { byCategoryMonth, categoryTotals, merchantTotals, monthlyTotals, resolveCategory } from './aggregate'
import type { Category, Merchant, Txn } from './types'

const tx = (id: string, month: string, amount: number, extra: Partial<Txn> = {}): Txn => ({
  id, key: id, accountId: 'A', uploadId: 'u', month, date: `${month}-01`, kind: 'expense', amount,
  rawMerchant: 'Shop', merchantKey: 'SHOP', ...extra,
})
const m: Merchant = { id: 'expense|SHOP', kind: 'expense', merchantKey: 'SHOP', displayName: 'Shop', aiCategory: 'groceries', needsReview: false }
const merchants = new Map([[m.id, m]])

test('resolution order: txn override > fixed > merchant override > AI > other', () => {
  expect(resolveCategory(tx('1', '2026-09', 1), merchants)).toBe('groceries')
  expect(resolveCategory(tx('1', '2026-09', 1), new Map([[m.id, { ...m, overrideCategory: 'dining' as const }]]))).toBe('dining')
  expect(resolveCategory(tx('1', '2026-09', 1, { fixedCategory: 'paypay' }), merchants)).toBe('paypay')
  expect(resolveCategory(tx('1', '2026-09', 1, { fixedCategory: 'paypay', overrideCategory: 'travel' }), merchants)).toBe('travel')
  expect(resolveCategory(tx('1', '2026-09', 1, { merchantKey: 'NEW' }), merchants)).toBe('other')
  expect(resolveCategory(tx('1', '2026-09', 1, { kind: 'income', merchantKey: 'NEW' }), merchants)).toBe('other_income')
})

test('refund in a later month nets that month, can go negative', () => {
  const txns = [tx('1', '2026-07', 10560), tx('2', '2026-08', -10560), tx('3', '2026-08', 500)]
  expect(monthlyTotals(txns)).toEqual([
    { month: '2026-07', total: 10560 },
    { month: '2026-08', total: -10060 },
  ])
})

test('byCategoryMonth builds stacked rows', () => {
  const r = (t: Txn): Category => (t.merchantKey === 'SHOP' ? 'groceries' : 'dining')
  const out = byCategoryMonth([tx('1', '2026-08', 100), tx('2', '2026-07', 50, { merchantKey: 'X' }), tx('3', '2026-08', 25)], r)
  expect(out.rows).toEqual([{ month: '2026-07', dining: 50 }, { month: '2026-08', groceries: 125 }])
  expect(out.categories.sort()).toEqual(['dining', 'groceries'])
})

test('categoryTotals and merchantTotals sort descending', () => {
  const txns = [tx('1', '2026-08', 100), tx('2', '2026-08', 300, { merchantKey: 'BIG', rawMerchant: 'Big' }), tx('3', '2026-08', 50)]
  expect(categoryTotals(txns, () => 'other')).toEqual([{ category: 'other', total: 450 }])
  expect(merchantTotals(txns, merchants)).toEqual([
    { id: 'expense|BIG', name: 'Big', total: 300, count: 1 },
    { id: 'expense|SHOP', name: 'Shop', total: 150, count: 2 },
  ])
})
```

- [ ] **Step 2: Run** `bun test src/lib/aggregate.test.ts` → FAIL

- [ ] **Step 3: Implement** `src/lib/aggregate.ts`

```ts
import { type Category, type Flow, type Merchant, type Txn, merchantId } from './types'

type Resolve = (t: Txn) => Category

export function resolveCategory(t: Txn, merchants: Map<string, Merchant>): Category {
  if (t.overrideCategory) return t.overrideCategory
  if (t.fixedCategory) return t.fixedCategory
  const m = merchants.get(merchantId(t.kind as Flow, t.merchantKey))
  return m?.overrideCategory ?? m?.aiCategory ?? (t.kind === 'income' ? 'other_income' : 'other')
}

function sumBy<K>(txns: Txn[], keyOf: (t: Txn) => K) {
  const out = new Map<K, number>()
  for (const t of txns) out.set(keyOf(t), (out.get(keyOf(t)) ?? 0) + t.amount)
  return out
}

export function monthlyTotals(txns: Txn[]) {
  return [...sumBy(txns, (t) => t.month)]
    .map(([month, total]) => ({ month, total }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

export function byCategoryMonth(txns: Txn[], resolve: Resolve) {
  const rows = new Map<string, { month: string } & Partial<Record<Category, number>>>()
  const categories = new Set<Category>()
  for (const t of txns) {
    const c = resolve(t)
    categories.add(c)
    const row = rows.get(t.month) ?? { month: t.month }
    row[c] = (row[c] ?? 0) + t.amount
    rows.set(t.month, row)
  }
  return { rows: [...rows.values()].sort((a, b) => a.month.localeCompare(b.month)), categories: [...categories] }
}

export function categoryTotals(txns: Txn[], resolve: Resolve) {
  return [...sumBy(txns, resolve)].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total)
}

export function merchantTotals(txns: Txn[], merchants: Map<string, Merchant>) {
  const out = new Map<string, { id: string; name: string; total: number; count: number }>()
  for (const t of txns) {
    const id = merchantId(t.kind as Flow, t.merchantKey)
    const row = out.get(id) ?? { id, name: merchants.get(id)?.displayName ?? t.rawMerchant, total: 0, count: 0 }
    row.total += t.amount
    row.count++
    out.set(id, row)
  }
  return [...out.values()].sort((a, b) => b.total - a.total)
}
```

- [ ] **Step 4: Run** `bun test src/lib` → all pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/aggregate.ts src/lib/aggregate.test.ts
git commit -m "feat: category resolution and dashboard aggregates"
```

---

### Task 7: AI categorization + settings + model factory

**Files:**
- Create: `src/lib/categorize.ts`, `src/lib/settings.ts`, `src/lib/model.ts`
- Test: `src/lib/categorize.test.ts`

**Interfaces:**
- Consumes: `db`, `Merchant`, `AI_SPENDING`, `INCOME`
- Produces:
  - `type Item = {id: string; name: string; kind: Flow}`, `type AiResult = {id; display_name; category; confidence}`, `type Generate = (items: Item[]) => Promise<AiResult[]>`
  - `aiGenerate(model: LanguageModel): Generate`
  - `applyResult(m: Merchant, r?: AiResult): Merchant`
  - `categorizePending(generate: Generate, batchSize = 50): Promise<{done: number; failed: number}>`
  - `type Provider = 'anthropic' | 'google' | 'openai'`, `DEFAULT_MODEL`, `PROVIDER_LABEL`, `interface AiSettings {provider; model; apiKey; verified: boolean}`, `loadSettings(): AiSettings | null`, `saveSettings(s)`
  - `makeModel(s: AiSettings): LanguageModel`

- [ ] **Step 1: Write the failing test** `src/lib/categorize.test.ts`

```ts
import { beforeEach, expect, test } from 'bun:test'
import { type AiResult, type Generate, applyResult, categorizePending } from './categorize'
import { db } from './db'
import type { Merchant } from './types'

const merchant = (key: string, kind: Merchant['kind'] = 'expense'): Merchant => ({
  id: `${kind}|${key}`, kind, merchantKey: key, displayName: key.toLowerCase(), needsReview: false,
})
const ok = (id: string, category: AiResult['category'], confidence = 0.9): AiResult => ({ id, display_name: `Nice ${id}`, category, confidence })

beforeEach(async () => {
  await db.delete()
  await db.open()
})

test('applyResult: valid, invalid-for-kind, low confidence, missing', () => {
  expect(applyResult(merchant('A'), ok('x', 'dining'))).toMatchObject({ aiCategory: 'dining', displayName: 'Nice x', needsReview: false })
  expect(applyResult(merchant('A'), ok('x', 'salary'))).toMatchObject({ aiCategory: 'other', needsReview: true })
  expect(applyResult(merchant('A', 'income'), ok('x', 'dining'))).toMatchObject({ aiCategory: 'other_income', needsReview: true })
  expect(applyResult(merchant('A'), ok('x', 'dining', 0.3))).toMatchObject({ aiCategory: 'dining', needsReview: true })
  const missing = applyResult(merchant('A'), undefined)
  expect(missing.aiCategory).toBeUndefined()
  expect(missing.needsReview).toBe(true)
})

test('categorizePending sends only uncategorized merchants, in batches, names not keys', async () => {
  await db.merchants.bulkAdd([merchant('A'), merchant('B'), merchant('C'), { ...merchant('D'), aiCategory: 'rent' }])
  const calls: string[][] = []
  const gen: Generate = async (items) => {
    calls.push(items.map((i) => i.name))
    return items.map((i) => ok(i.id, 'shopping'))
  }
  expect(await categorizePending(gen, 2)).toEqual({ done: 3, failed: 0 })
  expect(calls).toEqual([['a', 'b'], ['c']])
  expect((await db.merchants.get('expense|A'))?.aiCategory).toBe('shopping')
})

test('a failing batch is flagged and retried on the next run', async () => {
  await db.merchants.bulkAdd([merchant('A'), merchant('B')])
  let fail = true
  const gen: Generate = async (items) => {
    if (fail) throw new Error('401')
    return items.map((i) => ok(i.id, 'dining'))
  }
  expect(await categorizePending(gen)).toEqual({ done: 0, failed: 2 })
  expect((await db.merchants.get('expense|A'))?.needsReview).toBe(true)
  fail = false
  expect(await categorizePending(gen)).toEqual({ done: 2, failed: 0 })
  expect((await db.merchants.get('expense|A'))?.needsReview).toBe(false)
})

test('merchant missing from the AI response stays pending', async () => {
  await db.merchants.bulkAdd([merchant('A'), merchant('B')])
  await categorizePending(async () => [ok('expense|A', 'dining')])
  expect((await db.merchants.get('expense|B'))?.aiCategory).toBeUndefined()
  expect((await db.merchants.get('expense|B'))?.needsReview).toBe(true)
})
```

- [ ] **Step 2: Run** `bun test src/lib/categorize.test.ts` → FAIL

- [ ] **Step 3: Implement** `src/lib/categorize.ts`

```ts
import { type LanguageModel, Output, generateText } from 'ai'
import { z } from 'zod'
import { db } from './db'
import { AI_INCOME, AI_SPENDING, type Flow, type Merchant } from './types'

const schema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      display_name: z.string(),
      category: z.enum([...AI_SPENDING, ...AI_INCOME]),
      confidence: z.number(),
    }),
  ),
})

export type Item = { id: string; name: string; kind: Flow }
export type AiResult = z.infer<typeof schema>['results'][number]
export type Generate = (items: Item[]) => Promise<AiResult[]>

const SYSTEM = `You categorize merchant names from bank and e-wallet transaction exports (mostly Asia; currently Japanese MUFG and PayPay).
Names may be truncated, half-width katakana, romanized abbreviations, or card-network descriptors
(e.g. "JRC SHIN" = JR Central Shinkansen, "AMAZON.C" = Amazon, "SP" prefix = Shopify store).
For each item return:
- id: copied unchanged
- display_name: the clean, human-readable merchant name in its usual script (keep Japanese names Japanese)
- category: for kind "expense" one of ${AI_SPENDING.join(', ')}; for kind "income" one of ${AI_INCOME.join(', ')}
- confidence: 0..1, below 0.6 if you are guessing
Return one result per input item.`

export function aiGenerate(model: LanguageModel): Generate {
  return async (items) => {
    const { output } = await generateText({
      model,
      system: SYSTEM,
      prompt: JSON.stringify(items),
      output: Output.object({ schema }),
      providerOptions: { openai: { store: false } },
    })
    return output.results
  }
}

export function applyResult(m: Merchant, r?: AiResult): Merchant {
  if (!r) return { ...m, needsReview: true }
  const allowed: readonly string[] = m.kind === 'expense' ? AI_SPENDING : AI_INCOME
  const valid = allowed.includes(r.category)
  return {
    ...m,
    displayName: r.display_name || m.displayName,
    aiCategory: valid ? r.category : m.kind === 'expense' ? 'other' : 'other_income',
    confidence: r.confidence,
    needsReview: !valid || r.confidence < 0.6,
  }
}

export async function categorizePending(generate: Generate, batchSize = 50) {
  const pending = await db.merchants.filter((m) => !m.aiCategory).toArray()
  let done = 0
  let failed = 0
  for (let i = 0; i < pending.length; i += batchSize) {
    const chunk = pending.slice(i, i + batchSize)
    try {
      const results = await generate(chunk.map((m) => ({ id: m.id, name: m.displayName, kind: m.kind })))
      const byId = new Map(results.map((r) => [r.id, r]))
      await db.merchants.bulkPut(chunk.map((m) => applyResult(m, byId.get(m.id))))
      done += chunk.filter((m) => byId.has(m.id)).length
    } catch (e) {
      console.error('categorize failed', e)
      await db.merchants.bulkPut(chunk.map((m) => ({ ...m, needsReview: true })))
      failed += chunk.length
    }
  }
  return { done, failed }
}
```

- [ ] **Step 4: Run** `bun test src/lib` → all pass. (The "missing from response" test expects `done` to count only returned ids. Its assertion doesn't check `done`, which is fine.)

- [ ] **Step 5: Write `src/lib/settings.ts`**

```ts
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
```

- [ ] **Step 6: Write `src/lib/model.ts`** (thin SDK wiring, checked manually in Task 9)

```ts
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
```

- [ ] **Step 7: Typecheck** `bunx tsc -b` → no errors

- [ ] **Step 8: Commit**

```bash
git add src/lib/categorize.ts src/lib/categorize.test.ts src/lib/settings.ts src/lib/model.ts
git commit -m "feat: BYO-key AI merchant categorization"
```

---

### Task 8: i18n (Lingui) + app shell + routes

**Files:**
- Create: `lingui.config.ts`, `src/i18n.ts`, `src/po.d.ts`, `src/router.tsx`, `src/components/locale-toggle.tsx`, `src/components/category-label.ts`, `src/lib/format.ts`, `src/locales/{en,ja}.po` (generated)
- Modify: `vite.config.ts`, `src/main.tsx`
- Delete: `src/App.tsx`, `src/App.css`, `src/assets/`

**Interfaces:**
- Produces:
  - `setLocale(l: 'en' | 'ja')`
  - `router` with paths `/`, `/accounts/$accountId`, `/settings`
  - `CATEGORY_LABEL: Record<Category, MessageDescriptor>`
  - `formatMoney(minor, currency, locale)`, `formatMonth(m, locale)`
  - Page components imported from `src/routes/*` (created in Tasks 9–11 — create stubs now)

- [ ] **Step 1: Install**

```bash
bun add @lingui/core @lingui/react
bun add -d @lingui/cli @lingui/vite-plugin @lingui/babel-plugin-lingui-macro
```

- [ ] **Step 2: Config.** Create `lingui.config.ts`:

```ts
import { defineConfig } from '@lingui/cli'

export default defineConfig({
  sourceLocale: 'en',
  locales: ['en', 'ja'],
  catalogs: [{ path: '<rootDir>/src/locales/{locale}', include: ['src'] }],
})
```

Replace `vite.config.ts`:

```ts
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { lingui } from '@lingui/vite-plugin'

export default defineConfig({
  plugins: [react({ babel: { plugins: ['@lingui/babel-plugin-lingui-macro'] } }), lingui(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
```

(If the installed `@vitejs/plugin-react` rejects the `babel` option, switch to `@vitejs/plugin-react-swc` + `@lingui/swc-plugin` per the Lingui docs: `react({ plugins: [linguiMacroSwcPlugin()] })`.)

Add to `package.json` scripts: `"i18n": "lingui extract --clean"`.

- [ ] **Step 3: Write `src/po.d.ts`, `src/i18n.ts`, `src/lib/format.ts`**

```ts
// src/po.d.ts
declare module '*.po' {
  import type { Messages } from '@lingui/core'
  export const messages: Messages
}
```

```ts
// src/i18n.ts
import { i18n } from '@lingui/core'
import { messages as en } from './locales/en.po'
import { messages as ja } from './locales/ja.po'

export type Locale = 'en' | 'ja'

i18n.load({ en, ja })

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem('locale')
    if (saved === 'en' || saved === 'ja') return saved
  } catch {}
  return navigator.language.startsWith('ja') ? 'ja' : 'en'
}

export function setLocale(l: Locale) {
  try {
    localStorage.setItem('locale', l)
  } catch {}
  i18n.activate(l)
  document.documentElement.lang = l
}

setLocale(initialLocale())

export { i18n }
```

```ts
// src/lib/format.ts
// amounts are integer minor units: JPY has 0 fraction digits, SGD has 2, etc.
export function formatMoney(minor: number, currency: string, locale: string) {
  const f = new Intl.NumberFormat(locale, { style: 'currency', currency })
  return f.format(minor / 10 ** (f.resolvedOptions().maximumFractionDigits ?? 0))
}

export const formatMonth = (month: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short' }).format(new Date(`${month}-01T00:00:00`))
```

- [ ] **Step 4: Category labels** `src/components/category-label.ts`

```ts
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import type { Category } from '@/lib/types'

export const CATEGORY_LABEL: Record<Category, MessageDescriptor> = {
  groceries: msg`Groceries`,
  dining: msg`Dining`,
  transport: msg`Transport`,
  rent: msg`Rent`,
  utilities: msg`Utilities`,
  phone_internet: msg`Phone & Internet`,
  shopping: msg`Shopping`,
  health: msg`Health`,
  entertainment: msg`Entertainment`,
  travel: msg`Travel`,
  subscriptions: msg`Subscriptions`,
  paypay: msg`PayPay`,
  transfer_out: msg`Sent to others`,
  other: msg`Other`,
  excluded: msg`Excluded`,
  salary: msg`Salary`,
  cashback_points: msg`Cashback & points`,
  transfer_in: msg`Received from others`,
  interest: msg`Interest`,
  other_income: msg`Other income`,
}

// One fixed color per category; stable across months and accounts
export const CATEGORY_COLOR: Record<Category, string> = {
  groceries: '#16a34a', dining: '#ea580c', transport: '#2563eb', rent: '#7c3aed', utilities: '#0891b2',
  phone_internet: '#0d9488', shopping: '#db2777', health: '#dc2626', entertainment: '#ca8a04', travel: '#4f46e5',
  subscriptions: '#9333ea', paypay: '#e11d48', transfer_out: '#64748b', other: '#94a3b8', excluded: '#cbd5e1',
  salary: '#16a34a', cashback_points: '#f59e0b', transfer_in: '#2563eb', interest: '#0891b2', other_income: '#94a3b8',
}
```

(Before finalizing colors, load the `dataviz` skill and adjust if it flags contrast or colorblind issues.)

- [ ] **Step 5: Locale toggle** `src/components/locale-toggle.tsx`

```tsx
import { useLingui } from '@lingui/react'
import { type Locale, setLocale } from '@/i18n'

export function LocaleToggle() {
  const { i18n } = useLingui()
  return (
    <select aria-label="Language" value={i18n.locale} onChange={(e) => setLocale(e.target.value as Locale)} className="rounded border bg-background px-2 py-1 text-sm">
      <option value="en">EN</option>
      <option value="ja">日本語</option>
    </select>
  )
}
```

- [ ] **Step 6: Page stubs** (replaced in Tasks 9–11)

```tsx
// src/routes/accounts.tsx
export function AccountsPage() { return <div>accounts</div> }
// src/routes/account.tsx
export function AccountPage() { return <div>account</div> }
// src/routes/settings.tsx
export function SettingsPage() { return <div>settings</div> }
```

(Three files, one line each.)

- [ ] **Step 7: Router + layout** `src/router.tsx`

```tsx
import { Trans } from '@lingui/react/macro'
import { Link, Outlet, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { LocaleToggle } from '@/components/locale-toggle'
import { db } from '@/lib/db'
import { AccountPage } from '@/routes/account'
import { AccountsPage } from '@/routes/accounts'
import { SettingsPage } from '@/routes/settings'

function Layout() {
  const accounts = useLiveQuery(() => db.accounts.toArray().then((a) => a.sort((x, y) => x.createdAt - y.createdAt)), [])
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 p-4">
          <Link to="/" className="font-semibold">spendlook</Link>
          {accounts?.map((a) => (
            <Link key={a.id} to="/accounts/$accountId" params={{ accountId: a.id }} activeProps={{ className: 'font-semibold underline' }}>
              {a.name}
            </Link>
          ))}
          <div className="ml-auto flex items-center gap-3">
            <Link to="/settings" activeProps={{ className: 'font-semibold underline' }}><Trans>Settings</Trans></Link>
            <LocaleToggle />
          </div>
        </nav>
      </header>
      <p className="bg-muted px-4 py-2 text-center text-xs text-muted-foreground">
        <Trans>Your data stays in this browser only. Clearing site data deletes it, so export a backup in Settings.</Trans>
      </p>
      <main className="mx-auto max-w-6xl p-4"><Outlet /></main>
    </div>
  )
}

const rootRoute = createRootRoute({ component: Layout })
const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: '/', component: AccountsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/accounts/$accountId', component: AccountPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: SettingsPage }),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}
```

- [ ] **Step 8: Bootstrap.** Replace `src/main.tsx`:

```tsx
import { I18nProvider } from '@lingui/react'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { i18n } from './i18n'
import { router } from './router'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nProvider>
  </StrictMode>,
)
```

Delete `src/App.tsx`, `src/App.css`, `src/assets/`. Set `<title>spendlook</title>` in `index.html`.

- [ ] **Step 9: Extract catalogs**

Run: `bun run i18n`
Expected: `src/locales/en.po` and `src/locales/ja.po` created. Fill the `ja.po` msgstr for every msgid. Category labels:

| en | ja |
|---|---|
| Groceries | 食料品 |
| Dining | 外食 |
| Transport | 交通 |
| Rent | 家賃 |
| Utilities | 光熱費 |
| Phone & Internet | 通信費 |
| Shopping | 買い物 |
| Health | 医療・健康 |
| Entertainment | 娯楽 |
| Travel | 旅行 |
| Subscriptions | サブスク |
| PayPay | PayPay |
| Sent to others | 送金 |
| Other | その他 |
| Salary | 給与 |
| Cashback & points | キャッシュバック・ポイント |
| Received from others | 受け取り |
| Interest | 利息 |
| Other income | その他収入 |
| Excluded | 除外 |
| Settings | 設定 |
| Your data stays in this browser only. … | データはこのブラウザにのみ保存されます。サイトデータを消去すると削除されるため、設定からバックアップをエクスポートしてください。 |

- [ ] **Step 10: Verify**

Run: `bun run build && bun run test`
Expected: build OK, tests pass. Then run `bun run dev`, open the app, toggle 日本語, and confirm "設定" shows and survives a reload.

- [ ] **Step 11: Commit**

```bash
git add -A && git commit -m "feat: app shell, routing, en/ja i18n"
```

**Rule for Tasks 9–11:** every user-visible string uses `<Trans>` or `t` from `useLingui()` (`@lingui/react/macro`). After each task, run `bun run i18n` and fill in the new `ja.po` entries before committing. An empty `msgstr` in `ja.po` is a review failure.

---

### Task 9: Accounts page + Settings page (AI key, backup)

**Files:**
- Create: `src/lib/backup.ts`, `src/lib/backup.test.ts`
- Modify: `src/routes/accounts.tsx`, `src/routes/settings.tsx`

**Interfaces:**
- Consumes: `db`, `deleteAccount`, `loadSettings/saveSettings/DEFAULT_MODEL/PROVIDER_LABEL`, `aiGenerate`, `makeModel`
- Produces: `exportBackup(): Promise<string>`, `importBackup(json: string): Promise<void>`

- [ ] **Step 1: Write the failing backup test** `src/lib/backup.test.ts`

```ts
import { beforeEach, expect, test } from 'bun:test'
import { exportBackup, importBackup } from './backup'
import { db } from './db'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

test('round-trips all tables and merges into existing data', async () => {
  await db.accounts.add({ id: 'A', type: 'mufg', name: 'Main', currency: 'JPY', createdAt: 1 })
  await db.merchants.add({ id: 'expense|X', kind: 'expense', merchantKey: 'X', displayName: 'X', overrideCategory: 'rent', needsReview: false })
  const json = await exportBackup()
  await db.delete()
  await db.open()
  await db.accounts.add({ id: 'B', type: 'paypay', name: 'PP', currency: 'JPY', createdAt: 2 })
  await importBackup(json)
  expect((await db.accounts.toArray()).map((a) => a.id).sort()).toEqual(['A', 'B'])
  expect((await db.merchants.get('expense|X'))?.overrideCategory).toBe('rent')
})

test('rejects foreign JSON without writing', async () => {
  await expect(importBackup('{"hello":1}')).rejects.toThrow('Not a spendlook backup')
  expect(await db.accounts.count()).toBe(0)
})
```

- [ ] **Step 2: Run** `bun test src/lib/backup.test.ts` → FAIL

- [ ] **Step 3: Implement** `src/lib/backup.ts`

```ts
import { db } from './db'

export async function exportBackup(): Promise<string> {
  const [accounts, uploads, txns, merchants] = await Promise.all([
    db.accounts.toArray(), db.uploads.toArray(), db.txns.toArray(), db.merchants.toArray(),
  ])
  return JSON.stringify({ app: 'spendlook', version: 1, accounts, uploads, txns, merchants })
}

export async function importBackup(json: string) {
  const d = JSON.parse(json)
  if (d?.app !== 'spendlook' || d.version !== 1) throw new Error('Not a spendlook backup')
  await db.transaction('rw', [db.accounts, db.uploads, db.txns, db.merchants], async () => {
    await db.accounts.bulkPut(d.accounts)
    await db.uploads.bulkPut(d.uploads)
    await db.txns.bulkPut(d.txns)
    await db.merchants.bulkPut(d.merchants)
  })
}
```

- [ ] **Step 4: Run** `bun test src/lib` → all pass

- [ ] **Step 5: Accounts page** `src/routes/accounts.tsx`

```tsx
import { Trans, useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { type FormEvent, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { db } from '@/lib/db'
import { deleteAccount } from '@/lib/importer'
import { loadSettings } from '@/lib/settings'
import type { AccountType } from '@/lib/types'

export function AccountsPage() {
  const { t } = useLingui()
  const accounts = useLiveQuery(() => db.accounts.toArray().then((a) => a.sort((x, y) => x.createdAt - y.createdAt)), [])
  const [type, setType] = useState<AccountType>('mufg')
  const [name, setName] = useState('')
  const verified = loadSettings()?.verified

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    // MUFG and PayPay are JPY; custom accounts (v2) will let the user pick
    await db.accounts.add({ id: crypto.randomUUID(), type, name: name.trim(), currency: 'JPY', createdAt: Date.now() })
    setName('')
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold"><Trans>Accounts</Trans></h1>
      {!verified && (
        <p className="rounded border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          <Trans>Set your AI provider key in <Link to="/settings" className="underline">Settings</Link> before uploading.</Trans>
        </p>
      )}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {accounts?.map((a) => (
          <li key={a.id}>
            <Card>
              <CardHeader>
                <CardTitle><Link to="/accounts/$accountId" params={{ accountId: a.id }} className="hover:underline">{a.name}</Link></CardTitle>
                <CardDescription>{a.type === 'mufg' ? 'MUFG' : 'PayPay'}</CardDescription>
              </CardHeader>
              <CardFooter>
                <Button variant="ghost" size="sm" onClick={() => confirm(t`Delete this account and all its transactions?`) && deleteAccount(a.id)}>
                  <Trans>Delete</Trans>
                </Button>
              </CardFooter>
            </Card>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex flex-wrap items-center gap-2">
        <select aria-label={t`Account type`} value={type} onChange={(e) => setType(e.target.value as AccountType)} className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="mufg">MUFG</option>
          <option value="paypay">PayPay</option>
        </select>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t`Account name`} className="max-w-xs" />
        <Button type="submit"><Trans>Add account</Trans></Button>
      </form>
    </div>
  )
}
```

- [ ] **Step 6: Settings page** `src/routes/settings.tsx`

```tsx
import { Trans, useLingui } from '@lingui/react/macro'
import { type ChangeEvent, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { exportBackup, importBackup } from '@/lib/backup'
import { aiGenerate } from '@/lib/categorize'
import { makeModel } from '@/lib/model'
import { type AiSettings, DEFAULT_MODEL, PROVIDER_LABEL, type Provider, loadSettings, saveSettings } from '@/lib/settings'

export function SettingsPage() {
  const { t } = useLingui()
  const initial = loadSettings()
  const [provider, setProvider] = useState<Provider>(initial?.provider ?? 'anthropic')
  const [model, setModel] = useState(initial?.model ?? DEFAULT_MODEL.anthropic)
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? '')
  const [status, setStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>(initial?.verified ? 'ok' : 'idle')
  const [error, setError] = useState('')
  const [backupMsg, setBackupMsg] = useState('')

  async function saveAndTest() {
    const s: AiSettings = { provider, model: model.trim(), apiKey: apiKey.trim(), verified: false }
    saveSettings(s)
    setStatus('testing')
    setError('')
    try {
      const r = await aiGenerate(makeModel(s))([{ id: 'test', name: 'セブン-イレブン', kind: 'expense' }])
      if (!r.length) throw new Error('Empty response')
      saveSettings({ ...s, verified: true })
      setStatus('ok')
    } catch (e) {
      setStatus('fail')
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function download() {
    const url = URL.createObjectURL(new Blob([await exportBackup()], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `spendlook-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function restore(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      await importBackup(await file.text())
      setBackupMsg(t`Backup restored.`)
    } catch (err) {
      setBackupMsg(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold"><Trans>Settings</Trans></h1>
      <Card>
        <CardHeader><CardTitle><Trans>AI categorization</Trans></CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <label className="block text-sm">
            <Trans>Provider</Trans>
            <select value={provider} onChange={(e) => { const p = e.target.value as Provider; setProvider(p); setModel(DEFAULT_MODEL[p]); setStatus('idle') }} className="mt-1 block h-9 w-full rounded-md border bg-background px-2">
              {(Object.keys(PROVIDER_LABEL) as Provider[]).map((p) => <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>)}
            </select>
          </label>
          <label className="block text-sm"><Trans>Model</Trans><Input value={model} onChange={(e) => { setModel(e.target.value); setStatus('idle') }} className="mt-1" /></label>
          <label className="block text-sm"><Trans>API key</Trans><Input type="password" autoComplete="off" value={apiKey} onChange={(e) => { setApiKey(e.target.value); setStatus('idle') }} className="mt-1" /></label>
          <p className="text-xs text-muted-foreground">
            <Trans>Stored only in this browser and sent only to {PROVIDER_LABEL[provider]}. Only merchant names are sent, never amounts or dates.</Trans>
          </p>
          <div className="flex items-center gap-3">
            <Button onClick={saveAndTest} disabled={!apiKey.trim() || !model.trim() || status === 'testing'}>
              {status === 'testing' ? <Trans>Testing…</Trans> : <Trans>Save & test key</Trans>}
            </Button>
            {status === 'ok' && <span className="text-sm text-green-600"><Trans>Key works.</Trans></span>}
            {status === 'fail' && <span className="text-sm text-red-600"><Trans>Key test failed: {error}</Trans></span>}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle><Trans>Backup</Trans></CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={download}><Trans>Export backup</Trans></Button>
          <label className="cursor-pointer rounded-md border px-3 py-2 text-sm">
            <Trans>Import backup</Trans>
            <input type="file" accept="application/json,.json" className="sr-only" onChange={restore} />
          </label>
          {backupMsg && <span className="text-sm">{backupMsg}</span>}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 7: i18n + manual check.** Run `bun run i18n`, fill in the `ja.po` entries, then `bun run dev`. Check:
  - Adding and deleting an account works and the account appears in the nav.
  - Settings with a bad key shows "Key test failed: …".
  - A real key shows "Key works." (check the CSP-free dev build here; the CSP is checked in Task 12).
  - Export downloads JSON, and import restores it.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: accounts, AI key settings, backup export/import"
```

---

### Task 10: Account page — upload panel + upload history

**Files:**
- Create: `src/components/upload-panel.tsx`
- Modify: `src/routes/account.tsx`

**Interfaces:**
- Consumes: `parseFile`, `ImportError`, `importRows`, `deleteUpload`, `categorizePending`, `aiGenerate`, `makeModel`, `loadSettings`, `db`
- Produces: `<UploadPanel account={Account} />`. `AccountPage` renders `<Dashboard accountId currency flow hasMethod />` from Task 11 (until then, render a placeholder `<div />` in its place).

- [ ] **Step 1: Upload panel** `src/components/upload-panel.tsx`

```tsx
import { Trans, useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { type ChangeEvent, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { categorizePending, aiGenerate } from '@/lib/categorize'
import { db } from '@/lib/db'
import { deleteUpload, importRows } from '@/lib/importer'
import { makeModel } from '@/lib/model'
import { ImportError, parseFile } from '@/lib/parse'
import { loadSettings } from '@/lib/settings'
import type { Account } from '@/lib/types'

export function UploadPanel({ account }: { account: Account }) {
  const { t, i18n } = useLingui()
  const settings = loadSettings()
  const uploads = useLiveQuery(() => db.uploads.where('accountId').equals(account.id).reverse().sortBy('createdAt'), [account.id])
  const pending = useLiveQuery(() => db.merchants.filter((m) => !m.aiCategory).count(), [])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const importErrorText: Record<ImportError['code'], string> = {
    wrong_type_paypay: t`This looks like a PayPay file, not MUFG.`,
    wrong_type_mufg: t`This looks like a MUFG file, not PayPay.`,
    unknown_format: t`Unrecognized file. Upload the CSV exported from MUFG or PayPay.`,
  }

  async function categorize() {
    const r = await categorizePending(aiGenerate(makeModel(settings!)))
    return r.failed ? t`${r.failed} merchants could not be categorized. Retry below.` : ''
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setMessage('')
    try {
      const rows = parseFile(await file.arrayBuffer(), account.type)
      const u = await importRows(account, file.name, rows)
      const summary = t`${u.added} added, ${u.skipped} skipped.`
      setMessage(`${summary} ${t`Categorizing…`}`)
      setMessage(`${summary} ${await categorize()}`)
    } catch (err) {
      setMessage(err instanceof ImportError ? importErrorText[err.code] : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function retry() {
    setBusy(true)
    setMessage((await categorize()) || t`All merchants categorized.`)
    setBusy(false)
  }

  if (!settings?.verified) {
    return <p className="text-sm"><Trans>Set and test your AI key in <Link to="/settings" className="underline">Settings</Link> to upload.</Trans></p>
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-center gap-3">
          <label className={`rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground ${busy ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}>
            <Trans>Upload {account.type === 'mufg' ? 'MUFG' : 'PayPay'} CSV</Trans>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={onFile} disabled={busy} />
          </label>
          {!!pending && (
            <Button variant="outline" size="sm" onClick={retry} disabled={busy}><Trans>Retry categorize ({pending})</Trans></Button>
          )}
          {message && <span role="status" className="text-sm">{message}</span>}
        </div>
        {!!uploads?.length && (
          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground"><Trans>Upload history ({uploads.length})</Trans></summary>
            <ul className="mt-2 space-y-1 text-sm">
              {uploads.map((u) => (
                <li key={u.id} className="flex items-center gap-3">
                  <span className="tabular-nums">{new Date(u.createdAt).toLocaleString(i18n.locale)}</span>
                  <span className="truncate">{u.fileName}</span>
                  <span className="text-muted-foreground"><Trans>{u.added} added, {u.skipped} skipped</Trans></span>
                  <Button variant="ghost" size="sm" onClick={() => confirm(t`Delete the transactions from this upload?`) && deleteUpload(u.id)}><Trans>Delete</Trans></Button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Account page** `src/routes/account.tsx`

```tsx
import { Trans } from '@lingui/react/macro'
import { useParams } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Dashboard } from '@/components/dashboard'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UploadPanel } from '@/components/upload-panel'
import { db } from '@/lib/db'
import type { Flow } from '@/lib/types'

export function AccountPage() {
  const { accountId } = useParams({ from: '/accounts/$accountId' })
  const account = useLiveQuery(() => db.accounts.get(accountId), [accountId], null)
  const [flow, setFlow] = useState<Flow>('expense')
  if (account === null) return null // loading
  if (!account) return <p><Trans>Account not found.</Trans></p>
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{account.name}</h1>
      <UploadPanel account={account} />
      <Tabs value={flow} onValueChange={(v) => setFlow(v as Flow)}>
        <TabsList>
          <TabsTrigger value="expense"><Trans>Spending</Trans></TabsTrigger>
          <TabsTrigger value="income"><Trans>Income</Trans></TabsTrigger>
        </TabsList>
      </Tabs>
      <Dashboard key={`${account.id}-${flow}`} accountId={account.id} currency={account.currency} flow={flow} hasMethod={account.type === 'paypay'} />
    </div>
  )
}
```

Until Task 11 exists, create `src/components/dashboard.tsx` with `export function Dashboard(_: { accountId: string; currency: string; flow: 'expense' | 'income'; hasMethod: boolean }) { return null }`.

- [ ] **Step 3: Manual check** with the real files in `data/` (`bun run dev`):
  - Upload `data/mufg_*.csv` into a MUFG account → "142 added, 0 skipped" (the count matches the file's data rows).
  - Upload it again → "0 added, 142 skipped".
  - Upload the PayPay file into the MUFG account → the "looks like a PayPay file" message.
  - Upload into a PayPay account → added. Merchants get categorized (watch the network tab: requests go only to the provider origin).
  - Delete the upload → rows are gone.

- [ ] **Step 4: i18n + commit.** Run `bun run i18n`, fill in `ja.po`, then:

```bash
git add -A && git commit -m "feat: per-account CSV upload with history and categorize retry"
```

---

### Task 11: Dashboard — charts, breakdowns, transaction table, overrides

**Files:**
- Create: `src/components/category-select.tsx`
- Modify: `src/components/dashboard.tsx` (replace the stub)

**Interfaces:**
- Consumes: `db`, `resolveCategory`, `monthlyTotals`, `byCategoryMonth`, `categoryTotals`, `merchantTotals`, `CATEGORY_LABEL`, `CATEGORY_COLOR`, `formatMoney`, `formatMonth`, `SPENDING`, `INCOME`, `merchantId`
- Produces: `<Dashboard accountId currency flow hasMethod />`, `<CategorySelect flow value onChange />`

- [ ] **Step 1: Load the `dataviz` skill**, then build the charts to its rules (the colors from Task 8, axis formatting via `formatMoney`).

- [ ] **Step 2: Category select** `src/components/category-select.tsx`

```tsx
import { useLingui } from '@lingui/react'
import { CATEGORY_LABEL } from '@/components/category-label'
import { type Category, type Flow, INCOME, SPENDING } from '@/lib/types'

export function CategorySelect({ flow, value, onChange, label }: { flow: Flow; value: Category; onChange: (c: Category) => void; label: string }) {
  const { i18n } = useLingui()
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as Category)} className="rounded border bg-background px-1 py-0.5 text-sm">
      {(flow === 'expense' ? SPENDING : INCOME).map((c) => <option key={c} value={c}>{i18n._(CATEGORY_LABEL[c])}</option>)}
    </select>
  )
}
```

- [ ] **Step 3: Dashboard** `src/components/dashboard.tsx`

```tsx
import { Trans, useLingui } from '@lingui/react/macro'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CATEGORY_COLOR, CATEGORY_LABEL } from '@/components/category-label'
import { CategorySelect } from '@/components/category-select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { byCategoryMonth, categoryTotals, merchantTotals, monthlyTotals, resolveCategory } from '@/lib/aggregate'
import { db } from '@/lib/db'
import { formatMoney, formatMonth } from '@/lib/format'
import { type Category, type Flow, INCOME, SPENDING, type Txn, merchantId } from '@/lib/types'

export function Dashboard({ accountId, currency, flow, hasMethod }: { accountId: string; currency: string; flow: Flow; hasMethod: boolean }) {
  const { t, i18n } = useLingui()
  const locale = i18n.locale
  const yen = (n: number) => formatMoney(n, currency, locale)
  const allTxns = useLiveQuery(() => db.txns.where('accountId').equals(accountId).toArray(), [accountId])
  const merchantList = useLiveQuery(() => db.merchants.toArray(), [])
  const merchants = useMemo(() => new Map((merchantList ?? []).map((m) => [m.id, m])), [merchantList])
  const resolve = (tx: Txn) => resolveCategory(tx, merchants)

  const txns = useMemo(() => (allTxns ?? []).filter((x) => x.kind === flow), [allTxns, flow])
  // excluded rows stay in the transaction table (so they can be un-excluded) but never count
  const counted = useMemo(() => txns.filter((x) => resolveCategory(x, merchants) !== 'excluded'), [txns, merchants])
  const totals = useMemo(() => monthlyTotals(counted), [counted])
  const [pickedMonth, setPickedMonth] = useState<string>()
  const month = pickedMonth ?? totals.at(-1)?.month
  const [category, setCategory] = useState<Category | ''>('')
  const [search, setSearch] = useState('')
  const [method, setMethod] = useState('')
  const [reviewOnly, setReviewOnly] = useState(false)

  if (!allTxns || !merchantList) return null
  if (!txns.length) return <p className="text-sm text-muted-foreground"><Trans>No transactions yet. Upload a CSV above.</Trans></p>

  const idx = totals.findIndex((x) => x.month === month)
  const current = totals[idx]?.total ?? 0
  const previous = idx > 0 ? totals[idx - 1].total : undefined
  const change = previous ? ((current - previous) / Math.abs(previous)) * 100 : undefined
  const monthTxns = txns.filter((x) => x.month === month)
  const monthCounted = counted.filter((x) => x.month === month)
  const stacked = byCategoryMonth(counted, resolve)
  const needsReview = (tx: Txn) => {
    if (tx.overrideCategory || tx.fixedCategory) return false
    const m = merchants.get(merchantId(flow, tx.merchantKey))
    return !m?.overrideCategory && (m?.needsReview ?? true)
  }
  const methods = [...new Set(txns.map((x) => x.method).filter(Boolean))] as string[]
  const q = search.trim().toLowerCase()
  const rows = monthTxns
    .filter((x) => !category || resolve(x) === category)
    .filter((x) => !method || x.method === method)
    .filter((x) => !reviewOnly || needsReview(x))
    .filter((x) => !q || x.rawMerchant.toLowerCase().includes(q) || (merchants.get(merchantId(flow, x.merchantKey))?.displayName ?? '').toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <select aria-label={t`Month`} value={month} onChange={(e) => setPickedMonth(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
          {[...totals].reverse().map((x) => <option key={x.month} value={x.month}>{formatMonth(x.month, locale)}</option>)}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardHeader><CardTitle className="text-sm font-normal text-muted-foreground"><Trans>This month</Trans></CardTitle></CardHeader><CardContent className="text-2xl font-semibold tabular-nums">{yen(current)}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm font-normal text-muted-foreground"><Trans>Previous month</Trans></CardTitle></CardHeader><CardContent className="text-2xl font-semibold tabular-nums">{previous === undefined ? '—' : yen(previous)}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm font-normal text-muted-foreground"><Trans>Change</Trans></CardTitle></CardHeader><CardContent className="text-2xl font-semibold tabular-nums">{change === undefined ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(1)}%`}</CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle><Trans>By category per month</Trans></CardTitle></CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer>
            <BarChart data={stacked.rows}>
              <CartesianGrid vertical={false} strokeOpacity={0.2} />
              <XAxis dataKey="month" tickFormatter={(m) => formatMonth(m, locale)} />
              <YAxis tickFormatter={yen} width={90} />
              <Tooltip formatter={(v: number, name: string) => [yen(v), i18n._(CATEGORY_LABEL[name as Category])]} labelFormatter={(m) => formatMonth(m, locale)} />
              <Legend formatter={(name: string) => i18n._(CATEGORY_LABEL[name as Category])} />
              {stacked.categories.map((c) => <Bar key={c} dataKey={c} stackId="a" fill={CATEGORY_COLOR[c]} />)}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle><Trans>Categories — {formatMonth(month!, locale)}</Trans></CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {categoryTotals(monthCounted, resolve).map(({ category: c, total }) => (
                <li key={c}>
                  <button type="button" onClick={() => setCategory(category === c ? '' : c)} className="w-full text-left">
                    <div className="flex justify-between text-sm"><span className={category === c ? 'font-semibold' : ''}>{i18n._(CATEGORY_LABEL[c])}</span><span className="tabular-nums">{yen(total)}</span></div>
                    <div className="mt-1 h-2 rounded bg-muted"><div className="h-2 rounded" style={{ width: `${current > 0 ? Math.max(0, (total / current) * 100) : 0}%`, background: CATEGORY_COLOR[c] }} /></div>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle><Trans>Top merchants — {formatMonth(month!, locale)}</Trans></CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead><Trans>Merchant</Trans></TableHead><TableHead className="text-right"><Trans>Count</Trans></TableHead><TableHead className="text-right"><Trans>Total</Trans></TableHead><TableHead><Trans>Category</Trans></TableHead></TableRow></TableHeader>
              <TableBody>
                {merchantTotals(monthTxns, merchants).slice(0, 15).map((m) => {
                  const rec = merchants.get(m.id)
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="max-w-48 truncate">{m.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.count}</TableCell>
                      <TableCell className="text-right tabular-nums">{yen(m.total)}</TableCell>
                      <TableCell>
                        {rec ? (
                          <CategorySelect flow={flow} label={t`Category for ${m.name}`} value={rec.overrideCategory ?? rec.aiCategory ?? (flow === 'expense' ? 'other' : 'other_income')} onChange={(c) => db.merchants.update(m.id, { overrideCategory: c, needsReview: false })} />
                        ) : (
                          <span className="text-sm text-muted-foreground"><Trans>Fixed</Trans></span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle><Trans>Transactions — {formatMonth(month!, locale)}</Trans></CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t`Search merchant`} className="max-w-xs" />
            <select aria-label={t`Category filter`} value={category} onChange={(e) => setCategory(e.target.value as Category | '')} className="h-9 rounded-md border bg-background px-2 text-sm">
              <option value=""><Trans>All categories</Trans></option>
              {(flow === 'expense' ? SPENDING : INCOME).map((c) => <option key={c} value={c}>{i18n._(CATEGORY_LABEL[c])}</option>)}
            </select>
            {hasMethod && (
              <select aria-label={t`Payment method`} value={method} onChange={(e) => setMethod(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
                <option value=""><Trans>All methods</Trans></option>
                {methods.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            )}
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={reviewOnly} onChange={(e) => setReviewOnly(e.target.checked)} /><Trans>Needs review only</Trans></label>
          </div>
          <Table>
            <TableHeader><TableRow><TableHead><Trans>Date</Trans></TableHead><TableHead><Trans>Merchant</Trans></TableHead>{hasMethod && <TableHead><Trans>Method</Trans></TableHead>}<TableHead className="text-right"><Trans>Amount</Trans></TableHead><TableHead><Trans>Category</Trans></TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((x) => (
                <TableRow key={x.id}>
                  <TableCell className="tabular-nums">{x.date}</TableCell>
                  <TableCell className="max-w-64 truncate" title={x.rawMerchant}>
                    {merchants.get(merchantId(flow, x.merchantKey))?.displayName ?? x.rawMerchant}
                    {needsReview(x) && <Badge variant="outline" className="ml-2"><Trans>Review</Trans></Badge>}
                  </TableCell>
                  {hasMethod && <TableCell className="text-sm text-muted-foreground">{x.method}</TableCell>}
                  <TableCell className="text-right tabular-nums">{yen(x.amount)}</TableCell>
                  <TableCell><CategorySelect flow={flow} label={t`Category for this transaction`} value={resolve(x)} onChange={(c) => db.txns.update(x.id, { overrideCategory: c })} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
```

(ponytail: the table renders every row for one month, typically under 300. Add virtualization only if a month ever exceeds ~2k rows.)

- [ ] **Step 4: Manual check with the real data** (`bun run dev`):
  - MUFG Spending shows a "PayPay" category for top-ups.
  - A month with a JRC refund nets it.
  - Changing a merchant's category in Top merchants updates every row and the chart.
  - Changing a single row's category affects only that row.
  - PayPay Income shows Cashback & points.
  - The method filter lists `PayPay残高` / `クレジット VISA 7949`.
  - The ja toggle translates labels and formats ¥/months.
  - Set a merchant to Excluded → it disappears from totals and the chart but stays in the table. Set it back and it returns.
  - Phone width (DevTools 375px) has no horizontal page scroll; the tables scroll inside their cards.

- [ ] **Step 5: Run the full suite** `bun run test && bun run build` → all pass

- [ ] **Step 6: i18n + commit.** Run `bun run i18n`, fill in `ja.po`, then:

```bash
git add -A && git commit -m "feat: per-account spending/income dashboard with overrides"
```

---

### Task 12: Production check + deploy

**Files:**
- Create: `README.md`

- [ ] **Step 1: Prod build under CSP locally**

```bash
bun run build && bunx wrangler dev
```

Open the printed URL. In DevTools → Network, the document response carries the `Content-Security-Policy` header. Save and test a key → no CSP violation in the console. Upload works. Reloading `/accounts/<id>` serves the SPA (not a 404).

- [ ] **Step 2: README.md** (short)

```markdown
# spendlook

Browser-only spending dashboard for bank and e-wallet CSV exports (MUFG and PayPay today). Data stays in your browser (IndexedDB). AI categorization uses your own Anthropic, Gemini, or OpenAI key, and only merchant names are sent.

    bun install
    bun run dev       # local
    bun run test      # unit tests
    bun run i18n      # extract messages → src/locales/*.po
    bun run deploy    # build + wrangler deploy (Cloudflare static assets)
```

- [ ] **Step 3: Deploy (needs the user's Cloudflare login)**

Ask the user to run `! bunx wrangler login` if `bunx wrangler whoami` shows no account. Then run `bun run deploy`. Expected: a `*.workers.dev` URL. Open it and repeat Step 1's checks against prod.

- [ ] **Step 4: Commit**

```bash
git add README.md && git commit -m "docs: readme and deploy instructions"
```
