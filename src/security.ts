import DOMPurify from 'dompurify'
import { z } from 'zod'

// Imported first by main.tsx, before anything touches the DOM.

// zod probes `new Function` to pick a faster validator; the CSP forbids eval, so skip the probe
z.config({ jitless: true })

// Trusted Types (enforced by the CSP in public/_headers): every HTML string written to the DOM goes through
// DOMPurify, so injected markup can't run script. Only ECharts' tooltip uses innerHTML today. Script and
// script-URL sinks get no policy at all, so they stay blocked.
type TrustedTypes = { createPolicy: (name: string, rules: { createHTML: (html: string) => string }) => unknown }
const tt = (globalThis as { trustedTypes?: TrustedTypes }).trustedTypes
tt?.createPolicy('default', { createHTML: (html) => DOMPurify.sanitize(html) })
