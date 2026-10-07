import { gcm } from '@noble/ciphers/aes.js'
import { managedNonce, randomBytes } from '@noble/ciphers/utils.js'
import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'

// Optional passphrase lock. A random 64-byte master key (32 for AES-GCM, 32 for HMAC) encrypts the data; the
// passphrase only wraps the master key, so changing it never re-encrypts the data.
// Crypto is synchronous (noble) on purpose: awaiting WebCrypto inside an IndexedDB transaction commits it early.
// The master key lives in memory only while unlocked; a reload locks again.

const META = 'vault'
const ITERATIONS = 600_000 // OWASP 2023 minimum for PBKDF2-SHA256
const aes = managedNonce(gcm)

export interface VaultMeta { v: 1; salt: string; iterations: number; wrapped: string }
interface Keys { enc: Uint8Array; mac: Uint8Array }

let keys: Keys | null = null
let master: Uint8Array | null = null

function b64(b: Uint8Array) {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)) // spread overflows on big inputs
  return btoa(s)
}
const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const utf8 = new TextEncoder()
const fromUtf8 = new TextDecoder()

function readMeta(): VaultMeta | null {
  try {
    return JSON.parse(localStorage.getItem(META) ?? 'null')
  } catch {
    return null
  }
}
let meta = readMeta() // read on every database call, so cached

export const loadMeta = () => meta
export const isEnabled = () => meta !== null
export const isUnlocked = () => keys !== null
export const isLocked = () => isEnabled() && !isUnlocked()

async function kek(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const base = await crypto.subtle.importKey('raw', utf8.encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 256))
}

export const split = (m: Uint8Array): Keys => ({ enc: m.slice(0, 32), mac: m.slice(32) })

export async function wrap(master: Uint8Array, passphrase: string, iterations = ITERATIONS): Promise<VaultMeta> {
  const salt = randomBytes(16)
  return { v: 1, salt: b64(salt), iterations, wrapped: b64(aes(await kek(passphrase, salt, iterations)).encrypt(master)) }
}

// Throws on a wrong passphrase (the GCM tag fails)
export async function unwrap(meta: VaultMeta, passphrase: string): Promise<Uint8Array> {
  return aes(await kek(passphrase, unb64(meta.salt), meta.iterations)).decrypt(unb64(meta.wrapped))
}

export async function unlock(passphrase: string) {
  if (!meta) throw new Error('Encryption is not enabled')
  setMaster(await unwrap(meta, passphrase))
}

export const newMaster = () => randomBytes(64)

// Switches the keys the database layer uses. Only for enable/disable, which rewrite every row in one transaction.
export function setMaster(m: Uint8Array | null) {
  master = m
  keys = m && split(m)
}
export const getMaster = () => master

export function saveMeta(next: VaultMeta | null) {
  if (next) localStorage.setItem(META, JSON.stringify(next))
  else localStorage.removeItem(META)
  meta = next
}

// true: rows must be encrypted; false: plain (vault off). Throws while locked so nothing is read or written in the clear.
export function encrypting() {
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
