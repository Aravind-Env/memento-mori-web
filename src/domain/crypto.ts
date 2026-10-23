/**
 * Private vault crypto: passphrase-encrypted backups (AES-GCM, PBKDF2 key
 * derivation) and the app-lock check record. Uses Web Crypto only — no
 * dependencies, no network — and never stores derived keys anywhere: the
 * passphrase exists just long enough to derive a key in memory.
 */

export const PBKDF2_ITERATIONS = 250_000
/** Text encrypted for the lock check — enough to prove the passphrase works. */
const LOCK_CHECK = 'memento-mori-lock-check'

const SALT_BYTES = 16
const IV_BYTES = 12

export interface EncryptedEnvelope {
  format: 'memento-encrypted-v1'
  kdf: 'PBKDF2-SHA256'
  iterations: number
  /** Base64 key-derivation salt. */
  salt: string
  /** Base64 AES-GCM nonce. */
  iv: string
  /** Base64 ciphertext of the JSON payload. */
  data: string
  createdAt: string
}

/** Thrown for every clean failure the user (or a damaged file) can cause. */
export class VaultError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VaultError'
  }
}

function subtle(): SubtleCrypto {
  const c = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : undefined
  if (!c || !c.subtle) {
    throw new VaultError('Encryption needs a secure context (HTTPS or localhost).')
  }
  return c.subtle
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function randomBytes(length: number): Uint8Array {
  const c = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : undefined
  if (!c) throw new VaultError('No secure random available in this environment.')
  return c.getRandomValues(new Uint8Array(length))
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const encoded = new TextEncoder().encode(passphrase)
  const base = await subtle().importKey('raw', encoded as unknown as BufferSource, 'PBKDF2', false, [
    'deriveKey',
  ])
  return subtle().deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/**
 * Encrypts a plain export string into a self-contained envelope. The salt and
 * nonce are fresh randomness, so the same passphrase never yields the same
 * file twice.
 */
export async function encryptJSON(
  json: string,
  passphrase: string,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<EncryptedEnvelope> {
  const salt = randomBytes(SALT_BYTES)
  const iv = randomBytes(IV_BYTES)
  const key = await deriveKey(passphrase, salt, iterations)
  const cipher = await subtle().encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    new TextEncoder().encode(json) as unknown as BufferSource,
  )
  return {
    format: 'memento-encrypted-v1',
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(cipher)),
    createdAt: new Date().toISOString(),
  }
}

/** Light structural check used by import to route encrypted files. */
export function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    v.format === 'memento-encrypted-v1' &&
    typeof v.salt === 'string' &&
    typeof v.iv === 'string' &&
    typeof v.data === 'string' &&
    typeof v.iterations === 'number' &&
    Number.isFinite(v.iterations)
  )
}

/**
 * Decrypts an envelope back to a JSON string. A wrong passphrase fails with a
 * VaultError ("Wrong passphrase…") — AES-GCM authentication rejects it before
 * any plaintext exists, silently destroyed.
 */
export async function decryptJSON(
  envelope: unknown,
  passphrase: string,
): Promise<string> {
  if (!isEncryptedEnvelope(envelope)) {
    throw new VaultError('Not a Memento Mori encrypted backup.')
  }
  let salt: Uint8Array
  let iv: Uint8Array
  let data: Uint8Array
  try {
    salt = fromBase64(envelope.salt)
    iv = fromBase64(envelope.iv)
    data = fromBase64(envelope.data)
  } catch {
    throw new VaultError('This backup file is damaged.')
  }
  if (salt.length < 8 || iv.length < 12) {
    throw new VaultError('This backup file is damaged.')
  }
  const iterations = Math.min(Math.max(Math.round(envelope.iterations), 1), 2_000_000)
  try {
    const key = await deriveKey(passphrase, salt, iterations)
    const plain = await subtle().decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      data as unknown as BufferSource,
    )
    return new TextDecoder().decode(plain)
  } catch {
    if (envelope.iterations < 1 || envelope.iterations > 2_000_000) {
      throw new VaultError('This backup file is damaged.')
    }
    throw new VaultError('Wrong passphrase, or the file is damaged.')
  }
}

/**
 * App-lock security: a tiny constant is encrypted with the passphrase; to
 * unlock, the app re-derives the key and checks the constant. Only the
 * (salt, iv, cipher) triple is stored — never the passphrase, never a key.
 */
export async function makeLockRecord(
  passphrase: string,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<{ salt: string; iv: string; check: string; iterations: number }> {
  const envelope = await encryptJSON(LOCK_CHECK, passphrase, iterations)
  return {
    salt: envelope.salt,
    iv: envelope.iv,
    check: envelope.data,
    iterations: envelope.iterations,
  }
}

export async function verifyLockRecord(
  record: { salt: string; iv: string; check: string; iterations: number },
  passphrase: string,
): Promise<boolean> {
  try {
    const plain = await decryptJSON(
      {
        format: 'memento-encrypted-v1',
        kdf: 'PBKDF2-SHA256' as const,
        iterations: record.iterations,
        salt: record.salt,
        iv: record.iv,
        data: record.check,
      },
      passphrase,
    )
    return plain === LOCK_CHECK
  } catch {
    return false
  }
}
