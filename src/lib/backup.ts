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
