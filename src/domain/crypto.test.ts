import { describe, expect, it } from 'vitest'

import type { EncryptedEnvelope } from './crypto'
import {
  VaultError,
  decryptJSON,
  encryptJSON,
  isEncryptedEnvelope,
  makeLockRecord,
  verifyLockRecord,
} from './crypto'

const FAST = 2_000
const PASS = 'where the mind is without fear'

describe('encryptJSON / decryptJSON', () => {
  it('round-trips a payload and keeps the envelope self-describing', async () => {
    const envelope = await encryptJSON('{"schemaVersion":1,"a":1}', PASS, FAST)
    expect(envelope.format).toBe('memento-encrypted-v1')
    expect(envelope.kdf).toBe('PBKDF2-SHA256')
    const plain = await decryptJSON(envelope, PASS)
    expect(plain).toBe('{"schemaVersion":1,"a":1}')
  })

  it('produces a different file for the same passphrase (fresh salt + iv)', async () => {
    const a = await encryptJSON('same', PASS, FAST)
    const b = await encryptJSON('same', PASS, FAST)
    expect(a.salt).not.toBe(b.salt)
    expect(a.data).not.toBe(b.data)
  })

  it('fails cleanly on a wrong passphrase', async () => {
    const envelope = await encryptJSON('payload', PASS, FAST)
    await expect(decryptJSON(envelope, 'wrong pass')).rejects.toMatchObject({
      name: 'VaultError',
      message: 'Wrong passphrase, or the file is damaged.',
    })
  })

  it('rejects tampered ciphertext with the same clean error', async () => {
    const envelope: EncryptedEnvelope = await encryptJSON('payload', PASS, FAST)
    const bytes = envelope.data.split('')
    bytes[0] = bytes[0] === 'A' ? 'B' : 'A'
    await expect(
      decryptJSON({ ...envelope, data: bytes.join('') }, PASS),
    ).rejects.toBeInstanceOf(VaultError)
  })

  it('rejects foreign objects and damaged encodings without crashing', async () => {
    await expect(decryptJSON({ hello: 1 }, PASS)).rejects.toBeInstanceOf(VaultError)
    await expect(
      decryptJSON(
        { format: 'memento-encrypted-v1', kdf: 'PBKDF2-SHA256', iterations: FAST, salt: '!!!', iv: '???', data: '###' },
        PASS,
      ),
    ).rejects.toBeInstanceOf(VaultError)
    await expect(
      decryptJSON(
        { format: 'memento-encrypted-v1', kdf: 'PBKDF2-SHA256', iterations: 9e9, salt: 'YWJjZGVmZ2hpamts', iv: 'bm9uY2UxMnl6', data: 'AAAA' },
        PASS,
      ),
    ).rejects.toBeInstanceOf(VaultError)
  })

  it('detects encrypted envelopes for import routing', () => {
    expect(isEncryptedEnvelope({ format: 'other' })).toBe(false)
    expect(isEncryptedEnvelope(null)).toBe(false)
  })
})

describe('lock records', () => {
  it('verifies the right passphrase and refuses the wrong one', async () => {
    const record = await makeLockRecord(PASS, FAST)
    expect(await verifyLockRecord(record, PASS)).toBe(true)
    expect(await verifyLockRecord(record, 'nope')).toBe(false)
    // A corrupt record fails silently-false, never throwing into the UI.
    expect(await verifyLockRecord({ ...record, check: 'garbage' }, PASS)).toBe(false)
  })

  it('stores no readable passphrase material anywhere in the record', async () => {
    const record = await makeLockRecord('remember-the-memorable', FAST)
    const flattened = JSON.stringify(record).toLowerCase()
    expect(flattened).not.toContain('remember-the-memorable')
  })
})
