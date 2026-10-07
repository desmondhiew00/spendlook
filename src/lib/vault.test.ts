import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test'
import { liveQuery } from 'dexie'
import { PassphraseNeeded, changePassphrase, disableEncryption, enableEncryption, exportBackup, importBackup } from './backup'
import { db } from './db'
import { deleteAccount, importRows } from './importer'
import { loadKey, saveKey } from './settings'
import { isEnabled, saveMeta, setMaster, unlock } from './vault'

beforeAll(() => {
  const m = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(), key: () => null, get length() { return m.size },
  }
})

// vault state is module-level: leave it off for the other test files in this process
afterAll(() => {
  setMaster(null)
  saveMeta(null)
})

beforeEach(async () => {
  setMaster(null)
  saveMeta(null)
  localStorage.clear()
  await db.delete()
  await db.open()
})

const PASS = 'correct horse battery'
const row = (key: string, merchant: string) => ({ key, date: '2026-07-02', kind: 'expense' as const, amount: 1200, rawMerchant: merchant, merchantKey: merchant })

async function seed() {
  await db.accounts.add({ id: 'A', type: 'mufg', name: 'Main', currency: 'JPY', createdAt: 1 })
  return importRows({ id: 'A', type: 'mufg', name: 'Main', currency: 'JPY', createdAt: 1 }, 'july.csv', [row('2026/7/2|SECRET SHOP|1200', 'SECRET SHOP')])
}

// What a thief with the browser profile would see: the raw IndexedDB rows and keys
async function rawDump() {
  const idb = db.backendDB()
  const out: unknown[] = []
  for (const name of idb.objectStoreNames) {
    const store = idb.transaction(name).objectStore(name)
    const [keys, values] = await Promise.all([store.getAllKeys(), store.getAll()].map((r) => new Promise<unknown[]>((ok) => { r.onsuccess = () => ok(r.result) })))
    out.push(keys, values.map((v) => ({ ...(v as object), _e: undefined })))
  }
  return JSON.stringify(out)
}

test('enabling encrypts every row and key; the app API keeps working', async () => {
  const u = await seed()
  saveKey('anthropic', 'sk-ant-secret')
  expect(await rawDump()).toContain('SECRET SHOP')

  await enableEncryption(PASS)
  const dump = await rawDump()
  expect(dump).not.toContain('SECRET')
  expect(dump).not.toContain('july.csv')
  expect(dump).not.toContain('Main')
  expect(localStorage.getItem('ai-keys')).toStartWith('enc:')
  expect(loadKey('anthropic')).toBe('sk-ant-secret')

  // every access path the app uses
  expect((await db.merchants.get('expense|SECRET SHOP'))?.displayName).toBe('SECRET SHOP')
  expect((await db.txns.where('accountId').equals('A').toArray())[0].rawMerchant).toBe('SECRET SHOP')
  expect(await db.txns.where('uploadId').equals(u.id).count()).toBe(1)
  expect(await db.merchants.filter((m) => m.merchantKey === 'SECRET SHOP').count()).toBe(1)
  await db.merchants.update('expense|SECRET SHOP', { overrideCategory: 'rent' })
  await db.merchants.bulkUpdate([{ key: 'expense|SECRET SHOP', changes: { needsReview: true } }])
  expect(await db.merchants.get('expense|SECRET SHOP')).toMatchObject({ overrideCategory: 'rent', needsReview: true })
  expect(await db.txns.toCollection().primaryKeys()).toEqual(['A:2026/7/2|SECRET SHOP|1200'])

  // re-import dedupes against blinded keys
  expect((await importRows((await db.accounts.get('A'))!, 'again.csv', [row('2026/7/2|SECRET SHOP|1200', 'SECRET SHOP')])).added).toBe(0)
  await deleteAccount('A')
  expect(await db.txns.count()).toBe(0)
  expect(await db.merchants.count()).toBe(0)
})

test('locked: nothing can be read or written; only the right passphrase unlocks', async () => {
  await seed()
  await enableEncryption(PASS)
  setMaster(null)
  await expect(Promise.resolve(db.accounts.toArray())).rejects.toThrow('locked')
  await expect(Promise.resolve(db.accounts.put({ id: 'B', type: 'paypay', name: 'leak', currency: 'JPY', createdAt: 2 }))).rejects.toThrow('locked')
  expect(() => saveKey('openai', 'sk-x')).not.toThrow() // swallowed by saveKey, but nothing stored in the clear
  expect(localStorage.getItem('ai-keys')).toBeNull()
  await expect(unlock('wrong passphrase')).rejects.toThrow()
  await unlock(PASS)
  expect((await db.accounts.toArray()).map((a) => a.name)).toEqual(['Main'])
})

test('changing the passphrase keeps the data; disabling decrypts it', async () => {
  await seed()
  await enableEncryption(PASS)
  await changePassphrase(PASS, 'new passphrase!')
  setMaster(null)
  await expect(unlock(PASS)).rejects.toThrow()
  await unlock('new passphrase!')
  await expect(disableEncryption('wrong')).rejects.toThrow()
  await disableEncryption('new passphrase!')
  expect(isEnabled()).toBe(false)
  expect(await rawDump()).toContain('SECRET SHOP')
  expect((await db.merchants.get('expense|SECRET SHOP'))?.displayName).toBe('SECRET SHOP')
})

test('an encrypted backup needs its passphrase and restores into a plain database', async () => {
  await seed()
  await enableEncryption(PASS)
  const file = await exportBackup()
  expect(file).not.toContain('SECRET')
  setMaster(null)
  saveMeta(null)
  await db.delete()
  await db.open()
  await expect(importBackup(file)).rejects.toBeInstanceOf(PassphraseNeeded)
  await expect(importBackup(file, 'nope')).rejects.toBeInstanceOf(PassphraseNeeded)
  await importBackup(file, PASS)
  expect((await db.merchants.get('expense|SECRET SHOP'))?.displayName).toBe('SECRET SHOP')
})

test('a backup with bad rows is rejected before anything is written', async () => {
  const bad = JSON.stringify({ app: 'spendlook', version: 1, accounts: [{ id: 'A', type: 'evil' }], uploads: [], txns: [], merchants: [] })
  await expect(importBackup(bad)).rejects.toThrow('damaged')
  expect(await db.accounts.count()).toBe(0)
})

test('live queries still fire on changes while encrypted', async () => {
  await seed()
  await enableEncryption(PASS)
  const seen: string[][] = []
  const sub = liveQuery(() => db.accounts.toArray()).subscribe((a) => seen.push(a.map((x) => x.name)))
  await new Promise((r) => setTimeout(r, 20))
  await db.accounts.update('A', { name: 'Renamed' })
  await new Promise((r) => setTimeout(r, 20))
  sub.unsubscribe()
  expect(seen.at(-1)).toEqual(['Renamed'])
})
