import { db } from './db'

export async function exportBackup(): Promise<string> {
  const [accounts, uploads, txns, merchants, usage] = await Promise.all([
    db.accounts.toArray(), db.uploads.toArray(), db.txns.toArray(), db.merchants.toArray(), db.usage.toArray(),
  ])
  return JSON.stringify({ app: 'spendlook', version: 1, accounts, uploads, txns, merchants, usage })
}

export async function importBackup(json: string) {
  const d = JSON.parse(json)
  if (d?.app !== 'spendlook' || d.version !== 1) throw new Error('Not a spendlook backup')
  await db.transaction('rw', [db.accounts, db.uploads, db.txns, db.merchants, db.usage], async () => {
    await db.accounts.bulkPut(d.accounts)
    await db.uploads.bulkPut(d.uploads)
    await db.txns.bulkPut(d.txns)
    await db.merchants.bulkPut(d.merchants)
    await db.usage.bulkPut(d.usage ?? []) // older backups predate the usage log
  })
}

// Every table, including AI usage logs. Settings and keys in localStorage are cleared by the caller.
export async function deleteAllData() {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })
}
