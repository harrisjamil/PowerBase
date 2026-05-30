import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import type { PoolClient } from "pg"
import { generateSecret, generateURI, verify } from "otplib"
import QRCode from "qrcode"
import {
  ensureControlSchema,
  getControlSchema,
  getQuotedAdminTotpPendingTableRef,
  getQuotedAdminTotpTableRef,
  quotePgIdentifier,
} from "@/lib/control-schema"
import { ensureDbBootstrap } from "@/lib/db-bootstrap-cache"
import { getAuthSecret } from "@/lib/security/auth-secret"

const TOTP_ISSUER = "PowerBase Admin"
const PENDING_TTL_MS = 10 * 60 * 1000
/** Allow ±1 step (30s) for clock skew between server and authenticator app. */
const TOTP_VERIFY_OPTIONS = { epochTolerance: 1 } as const

function getEncryptionKey() {
  return createHash("sha256").update(getAuthSecret("powerbase-totp")).digest()
}

function encryptSecret(secret: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString("base64url")
}

function decryptSecret(payload: string): string | null {
  try {
    const buffer = Buffer.from(payload, "base64url")
    const iv = buffer.subarray(0, 12)
    const tag = buffer.subarray(12, 28)
    const encrypted = buffer.subarray(28)
    const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}

function getBootstrapKey(client: PoolClient) {
  return `${getControlSchema()}::admin-totp`
}

async function ensureAdminTotpPendingTable(client: PoolClient) {
  await ensureControlSchema(client)
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${getQuotedAdminTotpPendingTableRef()} (
      enrollment_id text PRIMARY KEY,
      role_oid integer NOT NULL,
      username text NOT NULL,
      secret_encrypted text NOT NULL,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  await client.query(`
    CREATE INDEX IF NOT EXISTS ${quotePgIdentifier("admin_totp_pending_role_oid_idx")}
    ON ${getQuotedAdminTotpPendingTableRef()} (role_oid)
  `)
}

export async function ensureAdminTotpTable(client: PoolClient) {
  await ensureControlSchema(client)
  await ensureDbBootstrap(getBootstrapKey(client), async () => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${getQuotedAdminTotpTableRef()} (
        role_oid integer PRIMARY KEY,
        username text NOT NULL,
        secret_encrypted text NOT NULL,
        enabled_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await client.query(`
      CREATE INDEX IF NOT EXISTS ${quotePgIdentifier("admin_totp_username_idx")}
      ON ${getQuotedAdminTotpTableRef()} (username)
    `)
  })
  await ensureAdminTotpPendingTable(client)
}

async function deleteExpiredPendingEnrollments(client: PoolClient) {
  await client.query(
    `
      DELETE FROM ${getQuotedAdminTotpPendingTableRef()}
      WHERE expires_at < now()
    `
  )
}

export async function getAdminTotpStatus(client: PoolClient, roleOid: number) {
  await ensureAdminTotpTable(client)
  const result = await client.query<{ role_oid: number; enabled_at: string }>(
    `
      SELECT role_oid, enabled_at
      FROM ${getQuotedAdminTotpTableRef()}
      WHERE role_oid = $1
    `,
    [roleOid]
  )
  return {
    enrolled: result.rows.length > 0,
    enabledAt: result.rows[0]?.enabled_at ?? null,
  }
}

export async function isAdminTotpEnrolled(client: PoolClient, roleOid: number) {
  const status = await getAdminTotpStatus(client, roleOid)
  return status.enrolled
}

export async function startAdminTotpEnrollment(
  client: PoolClient,
  roleOid: number,
  username: string
) {
  await ensureAdminTotpTable(client)
  await deleteExpiredPendingEnrollments(client)

  const secret = generateSecret()
  const enrollmentId = randomBytes(16).toString("base64url")
  const expiresAt = new Date(Date.now() + PENDING_TTL_MS)

  await client.query(
    `
      DELETE FROM ${getQuotedAdminTotpPendingTableRef()}
      WHERE role_oid = $1
    `,
    [roleOid]
  )

  await client.query(
    `
      INSERT INTO ${getQuotedAdminTotpPendingTableRef()} (
        enrollment_id,
        role_oid,
        username,
        secret_encrypted,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5)
    `,
    [enrollmentId, roleOid, username, encryptSecret(secret), expiresAt]
  )

  const otpauthUrl = generateURI({
    issuer: TOTP_ISSUER,
    label: username,
    secret,
  })
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl)

  return {
    enrollmentId,
    qrCodeDataUrl,
    manualEntryKey: secret,
  }
}

async function getPendingEnrollment(client: PoolClient, enrollmentId: string) {
  await ensureAdminTotpTable(client)
  await deleteExpiredPendingEnrollments(client)

  const result = await client.query<{
    enrollment_id: string
    role_oid: number
    username: string
    secret_encrypted: string
    expires_at: Date
  }>(
    `
      SELECT enrollment_id, role_oid, username, secret_encrypted, expires_at
      FROM ${getQuotedAdminTotpPendingTableRef()}
      WHERE enrollment_id = $1
    `,
    [enrollmentId]
  )

  return result.rows[0] ?? null
}

export async function confirmAdminTotpEnrollment(
  client: PoolClient,
  enrollmentId: string,
  code: string,
  expectedRoleOid?: number
) {
  const pending = await getPendingEnrollment(client, enrollmentId)
  if (!pending) {
    return { ok: false as const, error: "Enrollment expired. Please start again." }
  }

  if (expectedRoleOid !== undefined && pending.role_oid !== expectedRoleOid) {
    return { ok: false as const, error: "Enrollment does not belong to this account." }
  }

  if (pending.expires_at.getTime() < Date.now()) {
    await client.query(
      `
        DELETE FROM ${getQuotedAdminTotpPendingTableRef()}
        WHERE enrollment_id = $1
      `,
      [enrollmentId]
    )
    return { ok: false as const, error: "Enrollment expired. Please start again." }
  }

  const secret = decryptSecret(pending.secret_encrypted)
  if (!secret) {
    return { ok: false as const, error: "Failed to read enrollment. Please start again." }
  }

  const verification = await verify({ token: code, secret, ...TOTP_VERIFY_OPTIONS })
  if (!verification.valid) {
    return { ok: false as const, error: "Invalid verification code." }
  }

  await client.query(
    `
      INSERT INTO ${getQuotedAdminTotpTableRef()} (role_oid, username, secret_encrypted, enabled_at, updated_at)
      VALUES ($1, $2, $3, now(), now())
      ON CONFLICT (role_oid) DO UPDATE
      SET
        username = EXCLUDED.username,
        secret_encrypted = EXCLUDED.secret_encrypted,
        enabled_at = now(),
        updated_at = now()
    `,
    [pending.role_oid, pending.username, encryptSecret(secret)]
  )

  await client.query(
    `
      DELETE FROM ${getQuotedAdminTotpPendingTableRef()}
      WHERE enrollment_id = $1
    `,
    [enrollmentId]
  )

  return { ok: true as const }
}

export async function verifyAdminTotpCode(
  client: PoolClient,
  roleOid: number,
  code: string
) {
  await ensureAdminTotpTable(client)
  const result = await client.query<{ secret_encrypted: string }>(
    `
      SELECT secret_encrypted
      FROM ${getQuotedAdminTotpTableRef()}
      WHERE role_oid = $1
    `,
    [roleOid]
  )

  const row = result.rows[0]
  if (!row) return false

  const secret = decryptSecret(row.secret_encrypted)
  if (!secret) {
    console.error(
      "TOTP decrypt failed for role_oid=%s — AUTH_SECRET/SESSION_SECRET likely changed since enrollment",
      roleOid
    )
    return false
  }

  const verification = await verify({ token: code, secret, ...TOTP_VERIFY_OPTIONS })
  return verification.valid
}

export async function removeAdminTotp(client: PoolClient, roleOid: number) {
  await ensureAdminTotpTable(client)
  await client.query(
    `
      DELETE FROM ${getQuotedAdminTotpTableRef()}
      WHERE role_oid = $1
    `,
    [roleOid]
  )
  await client.query(
    `
      DELETE FROM ${getQuotedAdminTotpPendingTableRef()}
      WHERE role_oid = $1
    `,
    [roleOid]
  )
}
