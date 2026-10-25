import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const MAGIC = Buffer.from('PB1')
const AAD = Buffer.from('productive-browser-state-v1')

export function loadOrCreateKey(path: string): Buffer {
  if (existsSync(path)) {
    const key = readFileSync(path)
    if (key.length === 32) return key
  }
  const key = randomBytes(32)
  writeFileSync(path, key, { mode: 0o600 })
  return key
}

/** AES-256-GCM: the auth tag makes any edit to the file detectable. Layout: MAGIC | iv(12) | tag(16) | ciphertext. */
export function seal(key: Buffer, value: unknown): Buffer {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(AAD)
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body])
}

/** Throws if the data was not sealed with this key or was modified. */
export function unseal<T>(key: Buffer, data: Buffer): T {
  if (data.length < 31 || !data.subarray(0, 3).equals(MAGIC)) throw new Error('Not a sealed file')
  const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(3, 15))
  decipher.setAAD(AAD)
  decipher.setAuthTag(data.subarray(15, 31))
  const plain = Buffer.concat([decipher.update(data.subarray(31)), decipher.final()])
  return JSON.parse(plain.toString('utf8')) as T
}
