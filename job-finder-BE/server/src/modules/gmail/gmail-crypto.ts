import crypto from "crypto"
import { env } from "../../config/env"

let cachedKey: Buffer | null = null
function getKey(): Buffer {
  if (cachedKey) return cachedKey
  const raw = env.GMAIL_TOKEN_KEY
  if (!raw) {
    throw new Error("GMAIL_TOKEN_KEY is required for Gmail token encryption")
  }
  const candidates = [
    () => Buffer.from(raw, "base64"),
    () => Buffer.from(raw, "hex"),
    () => Buffer.from(raw, "utf8")
  ]
  for (const fn of candidates) {
    const key = fn()
    if (key.length === 32) {
      cachedKey = key
      return key
    }
  }
  throw new Error("GMAIL_TOKEN_KEY must decode to 32 bytes (AES-256)")
}

type EncryptedPayload = {
  v: 1
  iv: string
  tag: string
  ct: string
}

export function encryptJson(value: unknown): string {
  const KEY = getKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv)
  const plaintext = Buffer.from(JSON.stringify(value), "utf8")
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()

  const payload: EncryptedPayload = {
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ct: ciphertext.toString("base64")
  }

  return JSON.stringify(payload)
}

export function decryptJson<T = unknown>(payload: string): T {
  const KEY = getKey()
  const parsed = JSON.parse(payload) as EncryptedPayload
  if (!parsed || parsed.v !== 1) {
    throw new Error("Unsupported token payload version")
  }

  const iv = Buffer.from(parsed.iv, "base64")
  const tag = Buffer.from(parsed.tag, "base64")
  const ciphertext = Buffer.from(parsed.ct, "base64")

  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv)
  decipher.setAuthTag(tag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return JSON.parse(plaintext.toString("utf8")) as T
}
