# Custom CSV Accounts Implementation Plan

> Executed inline (superpowers:executing-plans). TDD for everything in `src/lib/`; UI checked in the browser.

**Goal:** A `custom` account type that imports any bank or e-wallet CSV. Encoding, delimiter and header row are detected locally. The AI proposes a column mapping, the user confirms it against a live preview, and the mapping is saved on the account and reused while the header matches.

**Spec:** `docs/superpowers/specs/2026-10-07-my-finance-design.md` § v2

## Decisions (settled here; the spec is silent)

- **Header-row detection is local.** It picks the first row in the first 20 whose cell count equals the most common row length and that is mostly non-numeric. Only the header + 3 sample rows go to the AI (spec privacy bound), so the AI never sees preamble lines.
- **Delimiter is detected locally:** `,`, `\t` or `;`, whichever is most consistent across the first lines.
- **Date formats are a fixed enum** the AI picks from and the user can change: `YMD`, `DMY`, `MDY`, `YYYYMMDD`, `D MMM Y`. Two-digit years mean 20xx.
- **Amount modes:** `signed` (one column, plus `negativeIs: expense | income`) or `split` (out and in columns). Amounts are parsed into integer minor units using the account currency's fraction digits. `(12.50)` means negative. Currency symbols and thousands separators are stripped. Anything else that isn't numeric throws `bad_row`.
- **The account currency is chosen at creation** (list from `Intl.supportedValuesOf('currency')`). The AI's currency guess is not used. The account already has one.
- **Rows whose date cell contains no digit are skipped** (footers like "Total", blank lines). Any other unparseable row → `ImportError('bad_row')`.
- **Consent:** the confirm panel first offers "Detect with AI" (states that header + 3 rows go to the provider) or "Map manually". Nothing is sent until the user clicks.
- **A header change** (different header cells at the saved header row) reopens the confirm panel, prefilled with the old mapping where the columns still exist.

## Tasks

1. **csv delimiter + money/date parsing** (`src/lib/csv.ts`, `src/lib/custom/values.ts`)
   - `parseCsv(text, delimiter = ',')`
   - `parseMinor(s, digits): number`
   - `parseDate(s, fmt): string` (YYYY-MM-DD)
   - `fractionDigits(currency): number`
   - Tests: tab/semicolon; `1,234.50`→123450 @2; `¥1,200`→1200 @0; `(12.50)`→-1250; `abc` throws; each date format; invalid month throws.
2. **Sniffing** (`src/lib/custom/sniff.ts`)
   - `detectEncoding(bytes): Encoding` (strict UTF-8 first, then shift_jis, big5, gbk, euc-kr)
   - `detectDelimiter(text)`
   - `detectHeaderRow(rows)`
   - `sniff(bytes): {encoding, delimiter, rows, headerRow}`
   - Tests: UTF-8 BOM, Shift-JIS fixture, a preamble before the header, tab delimiter.
3. **Custom parser** (`src/lib/custom/parse.ts`)
   - `parseCustom(rows, mapping, digits): ParsedRow[]`
   - `validateMapping(m, columnCount): string[]` (error codes)
   - `headerMatches(rows, m)`
   - Tests:
     - signed in both sign conventions
     - split columns
     - id-column key
     - hash key with an occurrence index (two identical same-day rows → distinct, stable keys)
     - footer skipped
     - bad amount throws
     - validate catches an out-of-range column, or amount mode missing its columns
4. **AI mapping detection** (`src/lib/custom/ai.ts`)
   - `aiDetectMapping(model)(header, samples): Promise<MappingGuess>`
   - `guessToMapping(guess, base): CustomMapping` (clamps invalid columns to undefined)
   - Tests on `guessToMapping` only; the SDK call is thin.
5. **Types, account creation, import wiring**
   - `AccountType` gains `custom`; `Account.mapping?: CustomMapping`
   - Accounts page: type `custom` + currency select
   - UploadPanel: custom path = sniff → if the mapping matches, import; else open `MappingPanel`
   - Reset-mapping button
6. **MappingPanel UI** (`src/components/mapping-panel.tsx`)
   - Consent buttons
   - Dropdowns for every mapping field + encoding/delimiter/header row
   - Live 10-row preview with a per-row error
   - Save & import
   - i18n en/ja
7. **Verify in the browser** with synthetic CSVs: SGD bank with preamble, signed amounts, DMY dates; Big5/GBK-free UTF-8 e-wallet with split columns; re-upload dedupe; header change reopens the panel.

## Review Focus

1. Same file twice → 0 added. Overlapping exports with identical same-day rows → no duplicates and no lost rows.
2. Decimal currencies: `12.5`, `12.50` and `1,234.5` all give exact minor units. No float drift (`0.1+0.2`-style).
3. A footer/summary row doesn't import as a transaction or abort the import.
4. Nothing reaches the AI before the user clicks "Detect with AI", and only header + 3 rows are sent.
5. A mapping whose columns no longer exist (the bank changed its export) can't silently import garbage.
