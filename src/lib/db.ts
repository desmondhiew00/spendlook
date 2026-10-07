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
