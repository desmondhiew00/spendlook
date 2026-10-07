import Dexie, { type DBCore, type DBCoreCursor, type DBCoreKeyRange, type DBCoreQuery, type EntityTable } from 'dexie'
import type { Account, AiUsage, Merchant, Txn, Upload } from './types'
import { blindKey, decryptJson, encryptJson, encrypting } from './vault'

export const db = new Dexie('spendlook') as Dexie & {
  accounts: EntityTable<Account, 'id'>
  uploads: EntityTable<Upload, 'id'>
  txns: EntityTable<Txn, 'id'>
  merchants: EntityTable<Merchant, 'id'>
  usage: EntityTable<AiUsage, 'id'>
}

db.version(1).stores({
  accounts: 'id',
  uploads: 'id, accountId',
  txns: 'id, accountId, uploadId',
  merchants: 'id',
})
db.version(2).stores({ usage: 'id, at' })

// While the vault is on, each row is stored as { id: HMAC(id), <indexed fields>, _e: AES-GCM(row) }.
// Primary keys are blinded because they carry content (txn ids embed the raw CSV row, merchant ids the name);
// indexed fields stay plain so queries work, and they are only random ids and timestamps.
// Lowest level: every other middleware (cache, observability, hooks) sees plain rows and keys.
const EQUAL = 1
const ANY = 3

function encryption(down: DBCore): Partial<DBCore> {
  return {
    table(name) {
      const t = down.table(name)
      const pk = t.schema.primaryKey.keyPath as string
      const indexed = t.schema.indexes.map((i) => i.keyPath as string)
      const seal = (v: Record<string, unknown>) => {
        const row: Record<string, unknown> = { [pk]: blindKey(v[pk]), _e: encryptJson(v) }
        for (const k of indexed) if (v[k] !== undefined) row[k] = v[k]
        return row
      }
      // rows without _e were written while the vault was off
      const unseal = (v: { _e?: Uint8Array } | undefined) => (v?._e ? decryptJson(v._e) : v)
      const blindRange = (r: DBCoreKeyRange): DBCoreKeyRange => {
        if (r.type === ANY) return r
        if (r.type === EQUAL) return { ...r, lower: blindKey(r.lower), upper: blindKey(r.upper) }
        throw new Error(`Range queries on the primary key of ${name} are not possible while encrypted`)
      }
      const blindQuery = (q: DBCoreQuery): DBCoreQuery => (q.index.isPrimaryKey ? { ...q, range: blindRange(q.range) } : q)

      return {
        ...t,
        mutate: (req) => guard(() => {
          if (!encrypting()) return t.mutate(req)
          if (req.type === 'deleteRange') return t.mutate({ ...req, range: blindRange(req.range) })
          if (req.type === 'delete') return t.mutate({ ...req, keys: req.keys.map(blindKey) }).then((res) => ({ ...res, results: req.keys }))
          const keys = req.values.map((v) => v[pk])
          return t.mutate({ ...req, values: req.values.map(seal) }).then((res) => ({ ...res, results: keys, lastResult: keys.at(-1) }))
        }),
        get: (req) => guard(() => (encrypting() ? t.get({ ...req, key: blindKey(req.key) }).then(unseal) : t.get(req))),
        getMany: (req) => guard(() => (encrypting() ? t.getMany({ ...req, keys: req.keys.map(blindKey) }).then((rows) => rows.map(unseal)) : t.getMany(req))),
        query: (req) => guard(() => {
          if (!encrypting()) return t.query(req)
          // blinded keys can't be reversed, so key-only queries read the rows and take the real key from inside
          return t.query({ ...req, values: true, query: blindQuery(req.query) }).then((res) => {
            const rows = res.result.map(unseal)
            return { ...res, result: req.values ? rows : rows.map((r) => r[pk]) }
          })
        }),
        count: (req) => guard(() => t.count(encrypting() ? { ...req, query: blindQuery(req.query) } : req)),
        openCursor: (req) => guard(() => {
          if (!encrypting()) return t.openCursor(req)
          const onPk = req.query.index.isPrimaryKey
          return t.openCursor({ ...req, values: true, query: blindQuery(req.query) }).then((cursor) => cursor && Object.create(cursor, {
            value: { get: () => unseal(cursor.value) },
            primaryKey: { get: () => unseal(cursor.value)[pk] },
            key: { get: () => (onPk ? unseal(cursor.value)[pk] : cursor.key) },
            continue: { value: (key?: unknown) => cursor.continue(key === undefined || !onPk ? key : blindKey(key)) },
            continuePrimaryKey: { value: (key: unknown, primaryKey: unknown) => cursor.continuePrimaryKey(onPk ? blindKey(key) : key, blindKey(primaryKey)) },
          }) as DBCoreCursor)
        }),
      }
    },
  }
}

// Plain functions returning the lower layer's promises, never `async`: a native promise would drop Dexie's
// transaction zone for the middlewares above. Sync throws (locked) become rejections.
function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return fn()
  } catch (e) {
    return Dexie.Promise.reject(e)
  }
}

db.use({ stack: 'dbcore', name: 'Encryption', level: -10, create: encryption })
