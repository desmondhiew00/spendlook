import { db } from './db'
import { readSecrets, writeSecrets } from './settings'
import {
  type VaultMeta, getMaster, isEnabled, loadMeta, newMaster, newRecoveryCode, openSlot, passphraseSlot, recoverySlot, saveMeta, setMaster, setPlainWrites, unlockedWithRecovery, consumeRecovery,
} from './vault'

// Turning encryption on or off rewrites every row. The vault meta records the switch as `pending` first, so a
// tab killed mid-way is finished by finishPending() on the next unlock instead of leaving rows half converted.

// Reads every row under the current keys, switches, writes them back, all in one transaction
async function rewriteAll(switchKeys: () => void, revert: () => void) {
  const secrets = readSecrets()
  try {
    await db.transaction('rw', db.tables, async () => {
      const all = await Promise.all(db.tables.map((t) => t.toArray()))
      switchKeys()
      for (const [i, t] of db.tables.entries()) {
        await t.clear()
        await t.bulkAdd(all[i])
      }
    })
  } catch (e) {
    revert()
    throw e
  }
  writeSecrets(secrets)
}

const settle = (m: VaultMeta) => { const { pending: _, ...rest } = m; return rest as VaultMeta }

// Returns the recovery key: shown to the user once, never stored in the clear
export async function enableEncryption(passphrase: string): Promise<string> {
  if (isEnabled()) throw new Error('Encryption is already on')
  const master = newMaster()
  const recovery = newRecoveryCode()
  // slow key derivation runs before the transaction opens
  const meta: VaultMeta = { v: 2, passphrase: await passphraseSlot(master, passphrase), recovery: await recoverySlot(master, recovery), passkeys: [], pending: 'enable' }
  await rewriteAll(() => { saveMeta(meta); setMaster(master) }, () => { saveMeta(null); setMaster(null) })
  saveMeta(settle(meta))
  return recovery
}

export async function disableEncryption(passphrase: string) {
  const meta = loadMeta()
  const master = getMaster()
  if (!meta || !master) throw new Error('Encryption is not on')
  await openSlot(meta.passphrase, passphrase) // confirms it's the owner, not just someone at an unlocked tab
  saveMeta({ ...meta, pending: 'disable' })
  await rewriteAll(() => setPlainWrites(true), () => { setPlainWrites(false); saveMeta(settle(meta)) })
  setPlainWrites(false)
  saveMeta(null)
  setMaster(null)
}

// After an unlock: completes an enable/disable that a closed tab interrupted. Reading copes with mixed rows.
export async function finishPending() {
  const meta = loadMeta()
  if (!meta?.pending) return
  if (meta.pending === 'enable') {
    await rewriteAll(() => {}, () => {})
    saveMeta(settle(meta))
  } else {
    await rewriteAll(() => setPlainWrites(true), () => setPlainWrites(false))
    setPlainWrites(false)
    saveMeta(null)
    setMaster(null)
  }
}

// Only re-wraps the master key; the data is untouched. After a recovery-key unlock `current` is not needed.
export async function changePassphrase(current: string | null, next: string) {
  const meta = loadMeta()
  const master = getMaster()
  if (!meta || !master) throw new Error('Encryption is not on')
  if (current !== null) await openSlot(meta.passphrase, current)
  else if (!unlockedWithRecovery()) throw new Error('The current passphrase is required')
  saveMeta({ ...meta, passphrase: await passphraseSlot(master, next) })
  consumeRecovery()
}

// Replaces the recovery key; the old one stops working. Needs the passphrase: an unlocked tab alone must not be
// enough to mint a new way in.
export async function newRecoveryKey(current: string): Promise<string> {
  const meta = loadMeta()
  const master = getMaster()
  if (!meta || !master) throw new Error('Unlock first')
  await openSlot(meta.passphrase, current)
  const code = newRecoveryCode()
  saveMeta({ ...meta, recovery: await recoverySlot(master, code) })
  return code
}
