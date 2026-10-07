# spendlook security review

Date: 2026-10-08 · Scope: whole app (client-only SPA on Cloudflare Workers static assets) · Method: code review plus browser tests of the built app with production headers (`wrangler dev`), including passkeys on a Chrome virtual authenticator with PRF

## Score

| | Start | Round 1 | Round 2 (now) |
|---|---|---|---|
| **Overall** | **6.5 / 10** | **8.5 / 10** | **9.2 / 10** |
| Data minimisation (what leaves the browser) | 5 | 9 | 9 |
| Data at rest (IndexedDB, localStorage) | 3 | 8 when on, 4 off, off by default | 9 (on by default) |
| Unlock strength | – | 6 (PBKDF2, 10 chars) | 9 (Argon2id, strength check, passkeys) |
| Exposure while unlocked | 4 | 4 | 7 (auto-lock, Trusted Types) |
| Browser hardening (CSP, headers) | 7 | 9 | 10 |
| Input handling (CSV, backup import) | 7 | 9 | 9 |
| Supply chain and deploy | 7 | 7 | 8 (audit gate in CI) |
| Transparency and consent | 5 | 9 | 9 |

No app scores 10. A client-side app can't be fully protected from a compromised device, a malicious browser extension, or a compromised dependency, because each of those runs with the same access as the app itself.

## Architecture (trust boundaries)

```
CSV file ──► browser (parse, store, chart) ──► IndexedDB / localStorage, encrypted   [this device only]
                    │
                    └── only if AI is on ──► api.anthropic.com | generativelanguage.googleapis.com | api.openai.com
Cloudflare: serves static files only. Never receives user data.
```

## Controls

### Data leaving the browser
- AI is opt-in. Without a key, nothing is sent anywhere. A consent checkbox is required before a key is saved or tested, and "Turn off AI" removes keys.
- Only merchant names and their kind (spending or income) are sent. Never amounts, dates, balances or account numbers.
- Transfers to or from people get a fixed transfer category, so the person's name is never sent. Companies (`(カ`, `SDN BHD`, `LTD`…) keep AI categorization. See `normalize.ts` `isPersonTransfer`.
- Column-mapping sample rows are redacted to their shape: digits become 0, words become x. The date format is checked locally against the real cells.
- OpenAI requests use `store: false`. Settings warns about Gemini's free tier.

### Data at rest
- **On by default.** Before the first account is created, a "Protect your data first" dialog asks for a passphrase. "Continue without encryption" is a visible link, and the choice is remembered. While data is stored unencrypted, the accounts page shows a permanent warning.
- **Keys.** A random 64-byte master key: 32 bytes for AES-256-GCM, 32 bytes for HMAC-SHA256. It is stored only wrapped, once per way to unlock (a "slot"):
  - **Passphrase.** Argon2id with 64 MiB, t=3, p=1 (RFC 9106). A strength check enforces at least 12 characters, rejects common passwords, and requires roughly 60 bits of estimated entropy. Old PBKDF2 vaults are upgraded on their next unlock.
  - **Recovery key.** 125 random bits in Crockford base32, shown once, with copy, save-to-file and an "I saved it" confirmation. Unlocking with it forces a new passphrase.
  - **Passkeys.** WebAuthn PRF: Touch ID, Face ID or Windows Hello. The authenticator's secret goes through HKDF to the wrapping key, so there is nothing to guess offline.
- **Re-authentication.** Adding a passkey, minting a new recovery key, changing the passphrase or turning encryption off all need the current passphrase. An unlocked tab alone can't add a new way in. The only exception: right after a recovery-key unlock, one passphrase reset is allowed.
- **Rows.** Each row is stored as `{ id: HMAC(id), <indexed ids>, _e: AES-GCM(row) }`. Primary keys are blinded because they carry content. This is done by a Dexie DBCore middleware at the lowest level using synchronous crypto (`@noble/ciphers`, `@noble/hashes`, both audited), so IndexedDB transactions stay atomic.
- **AI keys.** Stored as `enc:` + ciphertext in localStorage. While locked, every read or write throws.
- **Crash safety.** Turning encryption on or off records `pending` first. A tab killed mid-way is finished on the next unlock (`finishPending`).
- **Backups.** Encrypted when the vault is on, and carry the passphrase slot.

### While unlocked
- **Auto-lock** after 1, 5 (default), 15, 30 or 60 minutes without input, counting time the tab spends in the background. There is deliberately no "never". Locking wipes the key and reloads, dropping every decrypted value in memory. Closing the tab also locks.
- **Trusted Types** (`require-trusted-types-for 'script'`). Every HTML string written to the DOM goes through a DOMPurify `default` policy (only ECharts' tooltip uses one). Script and script-URL sinks have no policy, so they stay blocked. zod runs `jitless`, so nothing probes `eval`.
- **CSP:**
  - `script-src 'self'`, no inline scripts, no eval.
  - `connect-src` allows only the 3 AI APIs.
  - `object-src`, `worker-src`, `frame-src`, `base-uri` and `form-action` are `'none'`.
  - `frame-ancestors 'none'`, plus `upgrade-insecure-requests`.
- **Other headers:** HSTS, Permissions-Policy, COOP, CORP, `X-Frame-Options`, `nosniff`, `no-referrer`.

### Input handling
- CSV parsing never evaluates content. React escapes all output, and the chart tooltip escapes names.
- Backup import is validated with zod before any write.

### Supply chain and deploy
- Lockfile frozen in CI. Dependabot is enabled. Actions are pinned by SHA.
- **New:** `bun audit --audit-level=high` blocks a deploy that has a known-vulnerable dependency. `sharp` is pinned via `overrides` to the patched 0.35.5. `braces` is ignored: a glob DoS in dev-only tooling with no fixed release.
- Deploys are manual (`workflow_dispatch`) through the `production` environment.

## Residual risks

| Risk | Likelihood | Impact | Rating | Note |
|---|---|---|---|---|
| Compromised npm dependency exfiltrates data while unlocked (to an allowed AI host with an attacker's key, or via navigation) | Low | Critical | **High** | CSP can't tell keys apart or block navigation. Audit gate, lockfile and few dependencies reduce it; it can't be eliminated |
| Compromised deploy (GitHub or Cloudflare account, API token) ships malicious JS | Low | Critical | **High** | Owner actions below |
| Malicious browser extension reads the page while unlocked | Low | High | Medium | No web app can stop this. Auto-lock shrinks the window. Advise a browser profile with no extensions |
| User skips encryption | Medium | High | Medium | Default is on; the skip is explicit and a banner keeps warning |
| Merchant names reveal a profile to the AI provider | Medium (if AI on) | Medium | Medium | Opt-in, disclosed, people's names filtered |
| Person-transfer heuristic misses a format | Medium | Low | Low | The user can review |
| Merchants imported before 2026-10-08 (old transfer names) can be re-sent by "Re-categorize all" | Low | Low | Low | Delete and re-upload to reclassify |
| Passkey unlock unavailable (Firefox PRF support is partial; older devices) | – | – | Info | Passphrase and recovery key always work |

## Owner actions (only you can do these)

1. Turn on 2FA for GitHub and Cloudflare. Hardware keys or passkeys are preferred.
2. GitHub → Settings → Environments → `production` → add required reviewers.
3. Scope the Cloudflare API token to *Workers Scripts: Edit* for this account only, then rotate it.
4. Turn on Dependabot security updates and secret scanning.
5. Have the Terms and Privacy Policy reviewed by a lawyer before launch.
