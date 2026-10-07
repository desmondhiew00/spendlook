# spendlook security review

Date: 2026-10-08 · Scope: whole app (client-only SPA on Cloudflare Workers static assets) · Method: code review plus a browser test of the built app with production headers (`wrangler dev`)

## Score

| | Before | After |
|---|---|---|
| **Overall** | **6.5 / 10** | **8.5 / 10** |
| Data minimisation (what leaves the browser) | 5 | 9 |
| Data at rest (IndexedDB, localStorage) | 3 | 8 (with passphrase on) / 4 (off) |
| Browser hardening (CSP, headers) | 7 | 9 |
| Input handling (CSV, backup import) | 7 | 9 |
| Supply chain and deploy | 7 | 7 |
| Transparency and consent | 5 | 9 |

No app scores 10. A client-side app can't be fully protected from a compromised device, a malicious browser extension, or a compromised dependency, because each of those runs with the same access as the app itself.

## Architecture (trust boundaries)

```
CSV file ──► browser (parse, store, chart) ──► IndexedDB / localStorage   [this device only]
                    │
                    └── only if AI is on ──► api.anthropic.com | generativelanguage.googleapis.com | api.openai.com
Cloudflare: serves static files only. Never receives user data.
```

## What changed

| # | Fix | Where |
|---|---|---|
| P0-1 | AI is opt-in. Uploading works with no key; without one, nothing leaves the browser | `upload-panel.tsx`, `accounts.tsx` |
| P0-2 | Transfers to or from people get a fixed `transfer_in`/`transfer_out` category, so the person's name is never sent to the AI. Companies (`(カ`, `SDN BHD`, `LTD`…) keep AI categorization | `normalize.ts` `isPersonTransfer`, `parse/mufg.ts`, `custom/parse.ts` |
| P0-3 | Column-mapping sample rows are redacted to their shape (`2026/09/03` → `0000/00/00`, words → `x`). The date format is checked locally against the real cells | `custom/ai.ts` `redact`, `checkDateFormat` |
| P1-4 | Settings explains exactly what is sent; an explicit consent checkbox is required before a key is saved or tested; "Turn off AI" removes keys | `settings.tsx` |
| P1-5 | Gemini free-tier warning (Google may use the data for training and human review), with a link to the terms | `settings.tsx` |
| P2-6 | Headers: HSTS, Permissions-Policy, COOP, CORP, X-Frame-Options; CSP adds `object-src`/`worker-src`/`frame-src 'none'`, `base-uri`/`form-action 'none'`, `upgrade-insecure-requests`; `connect-src` no longer allows `'self'` | `public/_headers` |
| P2-7 | Backup import is validated with zod before anything is written | `backup.ts` |
| P2-9 | Parse errors are no longer logged with cell contents | `parse/index.ts`, `upload-panel.tsx` |
| + | **Optional passphrase encryption** of every table and of the AI keys | `vault.ts`, `db.ts`, `unlock-screen.tsx` |
| + | MUFG debit authorization number removed from display names | `parse/mufg.ts` |

## Encryption design

- **Keys.** A random 64-byte master key: 32 bytes for AES-256-GCM, 32 bytes for HMAC-SHA256. It is wrapped with a key derived by PBKDF2-SHA256 (600k iterations, 16-byte salt) from the passphrase. Changing the passphrase only re-wraps the master key; no data is re-encrypted.
- **Rows.** Each row is stored as `{ id: HMAC(id), <indexed ids>, _e: AES-GCM(row) }`. Primary keys are blinded because they carry content: a txn id contains the raw CSV row, a merchant id contains the name. The fields left in the clear are random UUIDs and the AI-usage timestamp.
- **Where it runs.** A Dexie DBCore middleware at the lowest level, so the cache, liveQuery and hooks layers above it all see plaintext. It uses synchronous crypto (`@noble/ciphers`, `@noble/hashes`, both audited) because awaiting WebCrypto inside an IndexedDB transaction would auto-commit it.
- **AI keys.** Stored as `enc:` + ciphertext in localStorage. While locked, every read or write throws, so nothing is ever written in the clear.
- **Backups.** With encryption on, the export is encrypted and carries the wrapped key, so it opens anywhere with the passphrase.
- **Tests.** Verified in `vault.test.ts` (6 tests) and in the browser: a raw IndexedDB dump after enabling contains no names, file names or keys; a wrong passphrase is rejected; the right one unlocks.

## Residual risks

| Risk | Likelihood | Impact | Rating | Mitigation / note |
|---|---|---|---|---|
| Compromised npm dependency exfiltrates data (e.g. to an attacker's own key at an allowed AI host, or by navigating to a URL) | Low | Critical | **High** | CSP can't block navigation, and `connect-src` can't tell keys apart. Keep `bun.lock` frozen, review Dependabot PRs, keep dependencies few |
| Compromised deploy (GitHub or Cloudflare account, `CLOUDFLARE_API_TOKEN`) ships malicious JS | Low | Critical | **High** | Manual: 2FA on GitHub and Cloudflare, required reviewer on the `production` environment, token scoped to Workers deploy only |
| Malicious browser extension or XSS reads data while unlocked | Low | High | Medium | Strict CSP, no `innerHTML`, React escaping, chart tooltip escaped. Encryption doesn't help while the vault is unlocked |
| Encryption off: anyone with the device or profile files reads everything | Medium | High | Medium | Offered in Settings; default off, since a forgotten passphrase loses data |
| Weak passphrase brute-forced offline | Low | High | Medium | 10-character minimum, PBKDF2 at 600k iterations. Upgrade path: Argon2id |
| Merchant names reveal a profile (health, religion, debts) to the AI provider | Medium (if AI on) | Medium | Medium | Opt-in, disclosed, people's names filtered, no amounts or dates. The provider's retention policy applies |
| Person-transfer heuristic misses a format (a name sent to the AI) | Medium | Low | Low | Regex covers JP/MY/US/CN/KR wording; the user can still review |
| Merchants imported before this change (old transfer names) can still be sent by "Re-categorize all" | Low | Low | Low | Only data from before 2026-10-08; delete and re-upload to reclassify |
| Plaintext backup file (encryption off) | Medium | Medium | Low | The UI says so |
| Tab killed in the moment between saving the vault meta and the transaction commit | Very low | Medium | Low | `ponytail:` note in `backup.ts`; a repair-on-unlock pass is the upgrade |
| Lock is per session; there is no idle auto-lock | Low | Low | Low | "Lock now" button. Add an idle timer if users ask |

## Manual actions for the owner

1. Turn on 2FA for GitHub and Cloudflare.
2. GitHub → Settings → Environments → `production` → add required reviewers.
3. Scope the Cloudflare API token to *Workers Scripts: Edit* for this account only, then rotate it.
4. Enable Dependabot security updates and secret scanning in the repo settings.
5. Have the Terms and Privacy Policy (`public/terms.html`, `public/privacy.html`) reviewed by a lawyer before launch.
