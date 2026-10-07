# Security policy

spendlook is a client-only web app: CSV data is parsed and stored in the user's browser (IndexedDB), optionally
encrypted with a passphrase, and only merchant names are sent to an AI provider when the user turns AI on with
their own key. See [docs/security-review.md](docs/security-review.md) for the design and known risks.

## Reporting a vulnerability

Email **[CONTACT EMAIL]** with steps to reproduce. Please don't open a public issue.
We aim to reply within 5 business days and to fix confirmed issues within 30 days, and we'll credit you if you wish.

In scope: the app at https://spendlook.app and this repository — e.g. XSS, CSP bypass, data leaving the browser
beyond what the Privacy Policy describes, flaws in the encryption.
Out of scope: attacks needing an already compromised device or malicious browser extension, social engineering,
denial of service, and findings in third-party AI providers or Cloudflare.

Please test only against your own data in your own browser.
