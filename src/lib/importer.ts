import { db } from './db'
import { type Account, type Flow, type Merchant, type ParsedRow, type Txn, type Upload, merchantId } from './types'

export async function importRows(account: Account, fileName: string, rows: ParsedRow[]): Promise<Upload> {
  const uploadId = crypto.randomUUID()
  const txns: Txn[] = rows.map((r) => ({ ...r, id: `${account.id}:${r.key}`, accountId: account.id, uploadId, month: r.date.slice(0, 7) }))

  return db.transaction('rw', db.txns, db.uploads, db.merchants, async () => {
    const existing = await db.txns.bulkGet(txns.map((t) => t.id))
    const seen = new Set<string>()
    const fresh: Txn[] = []
    // rows imported before times were parsed pick them up when the same file is uploaded again
    const backfill = txns.filter((t, i) => t.time && existing[i] && !existing[i]!.time)
    await db.txns.bulkUpdate(backfill.map((t) => ({ key: t.id, changes: { time: t.time } })))
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
        candidates.set(id, { id, kind: t.kind as Flow, merchantKey: t.merchantKey, displayName: t.rawMerchant.normalize('NFKC'), needsReview: true }) // until the AI is confident or the user picks
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

// Removes everything that belongs only to this account, including merchants (names, categories, overrides)
// no other account still uses. Merchants shared with another account are kept.
export async function deleteAccount(id: string) {
  await db.transaction('rw', db.accounts, db.uploads, db.txns, db.merchants, async () => {
    const mine = new Set((await db.txns.where('accountId').equals(id).toArray()).filter((t) => t.kind !== 'transfer').map((t) => merchantId(t.kind as Flow, t.merchantKey)))
    await db.txns.where('accountId').equals(id).delete()
    await db.uploads.where('accountId').equals(id).delete()
    await db.accounts.delete(id)
    const stillUsed = new Set((await db.txns.toArray()).filter((t) => t.kind !== 'transfer').map((t) => merchantId(t.kind as Flow, t.merchantKey)))
    await db.merchants.bulkDelete([...mine].filter((m) => !stillUsed.has(m)))
  })
}
