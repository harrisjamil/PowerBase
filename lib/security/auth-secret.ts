import { createHash } from "node:crypto"

const MIN_SECRET_LENGTH = 32

function readConfiguredSecret(): string | null {
  const value =
    process.env.AUTH_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    null
  if (!value || value.length < MIN_SECRET_LENGTH) {
    return null
  }
  return value
}

function isProduction() {
  return process.env.NODE_ENV === "production"
}

/** Dev-only fallback; never used in production. */
function getDevFallbackSecret(label: string): string {
  const seed = `${process.env.DATABASE_URL ?? "dev"}|${process.cwd()}|${label}`
  return createHash("sha256").update(seed).digest("base64url")
}

/**
 * Returns the application secret for signing sessions, challenges, and encryption.
 * In production, AUTH_SECRET (or SESSION_SECRET / NEXTAUTH_SECRET) must be set to ≥32 chars.
 */
export function getAuthSecret(label = "powerbase"): string {
  const configured = readConfiguredSecret()
  if (configured) {
    return configured
  }

  if (isProduction()) {
    throw new Error(
      "AUTH_SECRET must be set in production (minimum 32 characters). " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\""
    )
  }

  return getDevFallbackSecret(label)
}

export function assertAuthSecretConfigured(): void {
  if (isProduction() && !readConfiguredSecret()) {
    throw new Error(
      "AUTH_SECRET is required in production. Set a random string of at least 32 characters in .env"
    )
  }
}
