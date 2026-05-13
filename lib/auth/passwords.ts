import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto"

const SCRYPT_PREFIX = "scrypt"
const KEY_LENGTH = 64

function toBase64Url(buffer: Buffer): string {
  return buffer.toString("base64url")
}

function fromBase64Url(value: string): Buffer {
  return Buffer.from(value, "base64url")
}

export function isHashedPassword(value: string): boolean {
  return value.startsWith(`${SCRYPT_PREFIX}$`)
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const derived = scryptSync(password, salt, KEY_LENGTH)
  return `${SCRYPT_PREFIX}$${toBase64Url(salt)}$${toBase64Url(derived)}`
}

export function verifyPassword(password: string, storedPassword: string): boolean {
  if (!isHashedPassword(storedPassword)) {
    return password === storedPassword
  }

  const parts = storedPassword.split("$")
  if (parts.length !== 3) {
    return false
  }

  try {
    const salt = fromBase64Url(parts[1])
    const expected = fromBase64Url(parts[2])
    const actual = scryptSync(password, salt, expected.length)
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

export function needsPasswordUpgrade(storedPassword: string): boolean {
  return !isHashedPassword(storedPassword)
}
