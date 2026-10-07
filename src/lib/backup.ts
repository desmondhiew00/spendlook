import { z } from 'zod'
import { DATE_FORMATS } from './custom/values'
import { DELIMITERS, ENCODINGS } from './custom/sniff'
import { db } from './db'
import { INCOME, SPENDING } from './types'
import { b64, decryptBytes, encryptBytes, isEnabled, loadMeta, openSlot, split, unb64 } from './vault'

// A backup file is untrusted input: every row is checked before anything is written
const category = z.enum([...SPENDING, ...INCOME])
const col = z.number().int().nonnegative()
const mapping = z.object({
  encoding: z.enum(ENCODINGS),
  delimiter: z.enum(DELIMITERS),
  headerRow: z.number().int(),
  header: z.array(z.string()),
  dateCol: col,
  dateFormat: z.enum(DATE_FORMATS),
  timeCol: col.optional(),
  descriptionCols: z.array(col),
  amount: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('signed'), col, negativeIs: z.enum(['expense', 'income']) }),
    z.object({ mode: z.literal('split'), outCol: col, inCol: col }),
  ]),
  idCol: col.optional(),
  balanceCol: col.optional(),
})
const backup = z.object({
  app: z.literal('spendlook'),
  version: z.literal(1),
  accounts: z.array(z.object({
    id: z.string(), type: z.enum(['mufg', 'paypay', 'custom']), name: z.string(), currency: z.string(), createdAt: z.number(), mapping: mapping.optional(),
  })),
  uploads: z.array(z.object({
    id: z.string(), accountId: z.string(), fileName: z.string(), createdAt: z.number(), added: z.number(), skipped: z.number(),
  })),
  txns: z.array(z.object({
    id: z.string(), accountId: z.string(), uploadId: z.string(), month: z.string(), key: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().optional(), kind: z.enum(['expense', 'income', 'transfer']),
    amount: z.number(), rawMerchant: z.string(), merchantKey: z.string(), method: z.string().optional(),
    fixedCategory: category.optional(), overrideCategory: category.optional(),
  })),
  merchants: z.array(z.object({
    id: z.string(), kind: z.enum(['expense', 'income']), merchantKey: z.string(), displayName: z.string(), overrideName: z.string().optional(),
    aiCategory: category.optional(), confidence: z.number().optional(), overrideCategory: category.optional(), needsReview: z.boolean(),
  })),
  usage: z.array(z.object({
    id: z.string(), at: z.number(), provider: z.string(), model: z.string(), job: z.enum(['categorize', 'recategorize', 'test', 'map_columns']),
    items: z.number(), inputTokens: z.number(), outputTokens: z.number(), ok: z.boolean(),
  })).default([]), // older backups predate the usage log
})

// While the vault is on, the backup is encrypted with the same key and carries it wrapped by the passphrase,
// so it opens anywhere with that passphrase and never sits in Downloads in the clear
const slot = z.union([
  z.object({ kdf: z.literal('argon2id'), m: z.number().int().min(19_456), t: z.number().int().min(1), p: z.number().int().min(1), salt: z.string(), wrapped: z.string() }),
  z.object({ kdf: z.literal('pbkdf2'), iterations: z.number().int().min(100_000), salt: z.string(), wrapped: z.string() }),
  // backups made before Argon2id
  z.object({ v: z.literal(1), iterations: z.number().int().min(100_000), salt: z.string(), wrapped: z.string() }).transform((o) => ({ kdf: 'pbkdf2' as const, iterations: o.iterations, salt: o.salt, wrapped: o.wrapped })),
])
const sealed = z.object({ app: z.literal('spendlook'), version: z.literal(1), vault: slot, data: z.string() })

export class PassphraseNeeded extends Error {}

export async function exportBackup(): Promise<string> {
  const [accounts, uploads, txns, merchants, usage] = await Promise.all([
    db.accounts.toArray(), db.uploads.toArray(), db.txns.toArray(), db.merchants.toArray(), db.usage.toArray(),
  ])
  const json = JSON.stringify({ app: 'spendlook', version: 1, accounts, uploads, txns, merchants, usage })
  if (!isEnabled()) return json
  return JSON.stringify({ app: 'spendlook', version: 1, vault: loadMeta()!.passphrase, data: b64(encryptBytes(new TextEncoder().encode(json))) })
}

export async function importBackup(json: string, passphrase?: string) {
  let raw = parseJson(json)
  const enc = sealed.safeParse(raw)
  if (enc.success) {
    if (!passphrase) throw new PassphraseNeeded('This backup is encrypted. Enter its passphrase.')
    const master = await openSlot(enc.data.vault, passphrase).catch(() => { throw new PassphraseNeeded('Wrong passphrase for this backup.') })
    raw = parseJson(new TextDecoder().decode(decryptBytes(unb64(enc.data.data), split(master).enc)))
  }
  const parsed = backup.safeParse(raw)
  if (!parsed.success) throw new Error((raw as { app?: unknown })?.app === 'spendlook' ? 'This backup is damaged or from an unsupported version' : 'Not a spendlook backup')
  const d = parsed.data
  await db.transaction('rw', [db.accounts, db.uploads, db.txns, db.merchants, db.usage], async () => {
    await db.accounts.bulkPut(d.accounts)
    await db.uploads.bulkPut(d.uploads)
    await db.txns.bulkPut(d.txns)
    await db.merchants.bulkPut(d.merchants)
    await db.usage.bulkPut(d.usage)
  })
}

function parseJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    throw new Error('Not a spendlook backup')
  }
}

// Every table, including AI usage logs. Settings and keys in localStorage are cleared by the caller.
export async function deleteAllData() {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })
}
