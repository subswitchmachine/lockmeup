/**
 * AES-GCM encryption for the locked capture. The key is a non-extractable
 * CryptoKey kept in its own IndexedDB: it can decrypt, but its raw bytes can't
 * be exported, and the stored data is ciphertext. This is a "lock it away from
 * yourself" barrier — a determined console user could still script a decrypt —
 * not server-grade security.
 *
 * Requires a secure context (https or localhost), which the camera already needs.
 */

const KEY_DB = 'combo-lockbox-key'
const KEY_STORE = 'key'
const KEY_ID = 'aes'
const IV_BYTES = 12

export interface EncryptedPayload {
  iv: Uint8Array
  data: ArrayBuffer
}

function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(KEY_DB, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(KEY_STORE)) {
        req.result.createObjectStore(KEY_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function readStoredKey(db: IDBDatabase): Promise<CryptoKey | null> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(KEY_STORE, 'readonly').objectStore(KEY_STORE).get(KEY_ID)
    req.onsuccess = () => resolve((req.result as CryptoKey | undefined) ?? null)
    req.onerror = () => reject(req.error)
  })
}

function writeStoredKey(db: IDBDatabase, key: CryptoKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE, 'readwrite')
    tx.objectStore(KEY_STORE).put(key, KEY_ID)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Return the persisted encryption key, generating + storing one on first use. */
async function getKey(): Promise<CryptoKey> {
  const db = await openKeyDb()
  try {
    const existing = await readStoredKey(db)
    if (existing) return existing
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ])
    await writeStoredKey(db, key)
    return key
  } finally {
    db.close()
  }
}

export async function encryptString(plaintext: string): Promise<EncryptedPayload> {
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  )
  return { iv, data }
}

export async function decryptString(payload: EncryptedPayload): Promise<string> {
  const key = await getKey()
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(payload.iv) },
    key,
    payload.data,
  )
  return new TextDecoder().decode(plaintext)
}
