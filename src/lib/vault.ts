import { gcm } from '@noble/ciphers/aes.js'
import { managedNonce, randomBytes } from '@noble/ciphers/utils.js'
import { argon2idAsync } from '@noble/hashes/argon2.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'

// Data encryption. A random 64-byte master key (32 for AES-256-GCM, 32 for HMAC-SHA256) encrypts the data.
// The master key is stored only wrapped, once per way to unlock ("slot"): the passphrase (Argon2id), a one-time
// recovery key, and any passkeys (WebAuthn PRF). Changing or adding a way to unlock never re-encrypts the data.
// Crypto on the data path is synchronous (noble) on purpose: awaiting WebCrypto inside an IndexedDB transaction
// commits it early. The master key lives in memory only while unlocked; a reload or auto-lock forgets it.

const META = 'vault'
const ARGON = { m: 65_536, t: 3, p: 1 } // 64 MiB, RFC 9106 second recommended option
const aes = managedNonce(gcm)

type Kdf = { kdf: 'argon2id'; m: number; t: number; p: number } | { kdf: 'pbkdf2'; iterations: number } | { kdf: 'hkdf' }
export type Slot = Kdf & { salt: string; wrapped: string }
export type PasskeySlot = Slot & { id: string; name: string; created: number }
export interface VaultMeta {
  v: 2
  passphrase: Slot
  recovery?: Slot
  passkeys: PasskeySlot[]
  // set while every row is being rewritten; a tab killed mid-way is finished on the next unlock
  pending?: 'enable' | 'disable'
}
interface Keys {
  enc: Uint8Array
  mac: Uint8Array
}

let keys: Keys | null = null
let master: Uint8Array | null = null
let plain = false // true only while turning encryption off: rows are being written back in the clear
let recovered = false

function b64(b: Uint8Array) {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)) // spread overflows on big inputs
  return btoa(s)
}
const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const b64url = (b: Uint8Array) => b64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64url = (s: string) => unb64(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))
const utf8 = new TextEncoder()
const fromUtf8 = new TextDecoder()

function readMeta(): VaultMeta | null {
  try {
    const m = JSON.parse(localStorage.getItem(META) ?? 'null')
    // v1 (passphrase only, PBKDF2) is upgraded to Argon2id on its next unlock
    if (m?.v === 1) return { v: 2, passphrase: { kdf: 'pbkdf2', iterations: m.iterations, salt: m.salt, wrapped: m.wrapped }, passkeys: [] }
    return m
  } catch {
    return null
  }
}
let meta = readMeta() // read on every database call, so cached
export const readMetaForTest = () => {
  meta = readMeta()
}

export const loadMeta = () => meta
export const isEnabled = () => meta !== null
export const isUnlocked = () => keys !== null
export const isLocked = () => isEnabled() && !isUnlocked()

export function saveMeta(next: VaultMeta | null) {
  if (next) localStorage.setItem(META, JSON.stringify(next))
  else localStorage.removeItem(META)
  meta = next
}

export const split = (m: Uint8Array): Keys => ({ enc: m.slice(0, 32), mac: m.slice(32) })
export const newMaster = () => randomBytes(64)

export function setMaster(m: Uint8Array | null) {
  if (!m) recovered = false
  master = m
  keys = m && split(m)
}
export const getMaster = () => master
export const setPlainWrites = (on: boolean) => {
  plain = on
}

// Forget the key. The caller reloads so no decrypted state survives in memory.
export function lock() {
  master?.fill(0)
  setMaster(null)
}

// ---- slots ----

async function kek(slot: Kdf & { salt: string }, secret: string | Uint8Array): Promise<Uint8Array> {
  const salt = unb64(slot.salt)
  if (slot.kdf === 'hkdf') return hkdf(sha256, secret as Uint8Array, salt, utf8.encode('spendlook vault'), 32)
  const pass = utf8.encode((secret as string).normalize('NFKC'))
  if (slot.kdf === 'argon2id') return argon2idAsync(pass, salt, { m: slot.m, t: slot.t, p: slot.p, dkLen: 32 })
  const base = await crypto.subtle.importKey('raw', pass, 'PBKDF2', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: slot.iterations }, base, 256))
}

async function makeSlot(m: Uint8Array, kdf: Kdf, secret: string | Uint8Array, salt = randomBytes(16)): Promise<Slot> {
  const s = { ...kdf, salt: b64(salt) }
  return { ...s, wrapped: b64(aes(await kek(s, secret)).encrypt(m)) }
}

// A wrong passphrase / key shows up as a failed GCM tag when unwrapping
export const isWrongSecret = (e: unknown) => e instanceof Error && e.message === 'aes-gcm: invalid tag'

// Throws on a wrong secret (the GCM tag fails)
export const openSlot = async (slot: Slot, secret: string | Uint8Array) => aes(await kek(slot, secret)).decrypt(unb64(slot.wrapped))

export const passphraseSlot = (m: Uint8Array, passphrase: string) => makeSlot(m, { kdf: 'argon2id', ...ARGON }, passphrase)

// ---- recovery key: 125 random bits as 5 groups of 5 Crockford base32 characters ----

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export function newRecoveryCode() {
  const bytes = randomBytes(25)
  return [...bytes]
    .map((b) => B32[b & 31])
    .join('')
    .match(/.{5}/g)!
    .join('-') // 25 × 5 bits = 125 bits
}
const recoveryBytes = (code: string) =>
  utf8.encode(
    code
      .toUpperCase()
      .replace(/[^0-9A-Z]/g, '')
      .replace(/O/g, '0')
      .replace(/[IL]/g, '1'),
  )
export const recoverySlot = async (m: Uint8Array, code: string) => makeSlot(m, { kdf: 'hkdf' }, recoveryBytes(code))

// ---- unlocking ----

export async function unlock(passphrase: string) {
  if (!meta) throw new Error('Encryption is not enabled')
  const m = await openSlot(meta.passphrase, passphrase)
  if (meta.passphrase.kdf !== 'argon2id') saveMeta({ ...meta, passphrase: await passphraseSlot(m, passphrase) })
  setMaster(m)
}

// A recovery unlock is the one case where a new passphrase may be set without the old one, once
export const unlockedWithRecovery = () => recovered
export const consumeRecovery = () => {
  recovered = false
}
export async function unlockWithRecovery(code: string) {
  if (!meta?.recovery) throw new Error('No recovery key is set')
  setMaster(await openSlot(meta.recovery, recoveryBytes(code)))
  recovered = true
}

// ---- passkeys (WebAuthn PRF): the authenticator derives a secret only it can produce, behind Touch ID / Face ID / PIN ----

export const passkeysSupported = () => typeof PublicKeyCredential !== 'undefined' && !!navigator.credentials

type PrfResults = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } }

async function prfGet(credentialIds: string[], salts: Record<string, Uint8Array<ArrayBuffer>>) {
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32), // nothing is verified server-side: the secret comes from the PRF output alone
      rpId: location.hostname,
      userVerification: 'required',
      allowCredentials: credentialIds.map((id) => ({ type: 'public-key', id: unb64url(id) })),
      extensions: { prf: { evalByCredential: Object.fromEntries(Object.entries(salts).map(([id, s]) => [id, { first: s }])) } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null
  const first = (cred?.getClientExtensionResults() as PrfResults | undefined)?.prf?.results?.first
  if (!cred || !first) throw new Error('This passkey cannot unlock spendlook (no PRF support)')
  return { id: b64url(new Uint8Array(cred.rawId)), secret: new Uint8Array(first) }
}

const prfSalt = (id: string) => sha256(utf8.encode(`spendlook passkey ${id}`)) as Uint8Array<ArrayBuffer>

// Needs the passphrase, like a new recovery key: an unlocked tab alone must not be enough to add a way in
export async function addPasskey(name: string, passphrase: string): Promise<PasskeySlot> {
  if (!meta || !master) throw new Error('Unlock first')
  await openSlot(meta.passphrase, passphrase)
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: 'spendlook', id: location.hostname },
      user: { id: randomBytes(16), name: `spendlook ${name}`, displayName: `spendlook (${name})` },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      extensions: { prf: {} } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null
  if (!cred) throw new Error('Passkey creation was cancelled')
  if (!(cred.getClientExtensionResults() as PrfResults).prf?.enabled) throw new Error('This device or browser does not support unlocking with a passkey (WebAuthn PRF)')
  const id = b64url(new Uint8Array(cred.rawId))
  const { secret } = await prfGet([id], { [id]: prfSalt(id) }) // most authenticators only return the PRF output on sign-in
  const slot: PasskeySlot = { ...(await makeSlot(master, { kdf: 'hkdf' }, secret)), id, name, created: Date.now() }
  saveMeta({ ...meta, passkeys: [...meta.passkeys, slot] })
  return slot
}

export async function unlockWithPasskey() {
  if (!meta?.passkeys.length) throw new Error('No passkey is set')
  const { id, secret } = await prfGet(
    meta.passkeys.map((p) => p.id),
    Object.fromEntries(meta.passkeys.map((p) => [p.id, prfSalt(p.id)])),
  )
  const slot = meta.passkeys.find((p) => p.id === id)
  if (!slot) throw new Error('Unknown passkey')
  setMaster(await openSlot(slot, secret))
}

export function removePasskey(id: string) {
  if (meta) saveMeta({ ...meta, passkeys: meta.passkeys.filter((p) => p.id !== id) })
}

// ---- passphrase strength ----

const COMMON = /^(password|passw0rd|qwerty|letmein|welcome|iloveyou|admin|monkey|dragon|football|baseball|abc123|123456|111111|sunshine|princess|spendlook)/i
export type Weakness = 'short' | 'common' | 'weak'
// No dictionary download: length, a few well-known prefixes, and a rough entropy floor of 60 bits
export function passphraseWeakness(p: string): Weakness | null {
  if (p.length < 12) return 'short'
  if (COMMON.test(p.replace(/[^a-z0-9]/gi, ''))) return 'common'
  const pool = (/[a-z]/.test(p) ? 26 : 0) + (/[A-Z]/.test(p) ? 26 : 0) + (/\d/.test(p) ? 10 : 0) + (/[^a-zA-Z\d]/.test(p) ? 33 : 0) + ([...p].some((c) => c.charCodeAt(0) > 127) ? 100 : 0)
  const unique = new Set(p).size
  if (unique < 6 || Math.min(p.length, unique * 2) * Math.log2(pool) < 60) return 'weak'
  return null
}

// ---- data path ----

// true: rows must be encrypted; false: plain (vault off). Throws while locked so nothing is read or written in the clear.
export function encrypting() {
  if (plain) return false
  if (keys) return true
  if (meta) throw new Error('spendlook is locked')
  return false
}

function need(): Keys {
  if (!keys) throw new Error('spendlook is locked')
  return keys
}

export const encryptBytes = (data: Uint8Array, enc = need().enc) => aes(enc).encrypt(data)
export const decryptBytes = (data: Uint8Array, enc = need().enc) => aes(enc).decrypt(data)
export const encryptJson = (v: unknown) => encryptBytes(utf8.encode(JSON.stringify(v)))
export const decryptJson = (data: Uint8Array) => JSON.parse(fromUtf8.decode(decryptBytes(data)))

// Deterministic, so a primary key can still be looked up, but reveals nothing about the original value
export const blindKey = (key: unknown) => b64(hmac(sha256, need().mac, utf8.encode(JSON.stringify(key))))

// localStorage values (AI keys). Plain text while the vault is off; "enc:" + base64 while on.
export function seal(s: string): string {
  return encrypting() ? `enc:${b64(encryptBytes(utf8.encode(s)))}` : s
}
export function open(s: string | null): string | null {
  if (s === null || !s.startsWith('enc:')) return s
  return fromUtf8.decode(decryptBytes(unb64(s.slice(4))))
}

export { b64, unb64 }

// ---- auto-lock ----

export const AUTO_LOCK_OPTIONS = [1, 5, 15, 30, 60] as const // minutes; no "never" on purpose
export function autoLockMinutes(): number {
  try {
    const n = Number(localStorage.getItem('autolock'))
    if ((AUTO_LOCK_OPTIONS as readonly number[]).includes(n)) return n
  } catch {}
  return 5
}
export function setAutoLockMinutes(n: number) {
  try {
    localStorage.setItem('autolock', String(n))
  } catch {}
}

// The user chose "continue without encryption" once; the setup prompt isn't repeated (Settings still nags)
export const skippedEncryption = () => {
  try {
    return localStorage.getItem('vault-skip') === '1'
  } catch {
    return false
  }
}
export const skipEncryption = () => {
  try {
    localStorage.setItem('vault-skip', '1')
  } catch {}
}
