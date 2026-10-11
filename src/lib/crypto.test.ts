// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { decryptString, encryptString } from './crypto'

beforeEach(async () => {
  const dbs = await indexedDB.databases?.()
  if (dbs) {
    for (const db of dbs) {
      if (db.name) await new Promise((resolve) => {
        const req = indexedDB.deleteDatabase(db.name!)
        req.onsuccess = req.onerror = req.onblocked = () => resolve(undefined)
      })
    }
  }
})

describe('crypto round-trip', () => {
  it('encrypts a string and decrypts it back to the same value', async () => {
    const payload = await encryptString('hello world')
    expect(payload.iv).toBeInstanceOf(Uint8Array)
    expect(payload.iv.byteLength).toBe(12)
    expect(payload.data).toBeInstanceOf(ArrayBuffer)
    expect(await decryptString(payload)).toBe('hello world')
  })

  it('uses a fresh IV per encryption (semantic security)', async () => {
    const a = await encryptString('same')
    const b = await encryptString('same')
    expect(Buffer.from(a.iv).toString('hex')).not.toBe(Buffer.from(b.iv).toString('hex'))
  })

  it('produces different ciphertexts for the same plaintext', async () => {
    const a = await encryptString('same')
    const b = await encryptString('same')
    expect(Buffer.from(new Uint8Array(a.data)).toString('hex')).not.toBe(
      Buffer.from(new Uint8Array(b.data)).toString('hex'),
    )
  })

  it('round-trips empty strings', async () => {
    expect(await decryptString(await encryptString(''))).toBe('')
  })

  it('round-trips multi-byte unicode', async () => {
    const text = 'café · 日本語 · ✨ · 🔐'
    expect(await decryptString(await encryptString(text))).toBe(text)
  })

  it('rejects a tampered ciphertext (AES-GCM authentication)', async () => {
    const payload = await encryptString('secret')
    const tampered = new Uint8Array(payload.data)
    tampered[0] ^= 0xff
    await expect(
      decryptString({ iv: payload.iv, data: tampered.buffer }),
    ).rejects.toBeDefined()
  })

  it('reuses the persisted key across calls (same plaintext decrypts both payloads)', async () => {
    // Two independent encrypts followed by their own decrypts: if the key
    // were regenerated, the second decrypt would fail.
    const a = await encryptString('alpha')
    const b = await encryptString('beta')
    expect(await decryptString(a)).toBe('alpha')
    expect(await decryptString(b)).toBe('beta')
  })
})
