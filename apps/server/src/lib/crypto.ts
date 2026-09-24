import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const ALGO = 'aes-256-gcm'
const VERSION = 'v1'

export function generateKey(): Buffer {
  return randomBytes(32)
}

export function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('hex'), tag.toString('hex'), enc.toString('hex')].join(':')
}

export function decrypt(payload: string, key: Buffer): string {
  const parts = payload.split(':')
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Format payload terenkripsi nggak dikenali')
  }
  const [, ivHex, tagHex, dataHex] = parts
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]).toString('utf8')
}

export function loadOrCreateKey(path: string): Buffer {
  if (existsSync(path)) {
    const raw = readFileSync(path, 'utf8').trim()
    const key = Buffer.from(raw, 'hex')
    if (key.length !== 32) {
      throw new Error(`Kunci di ${path} rusak (harus 32 byte)`)
    }
    return key
  }

  const key = generateKey()
  writeFileSync(path, key.toString('hex'), { mode: 0o600 })
  return key
}
