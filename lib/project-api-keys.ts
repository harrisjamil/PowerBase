import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto"
import type { PoolClient } from "pg"
import {
  ensureControlSchema,
  getControlSchema,
  getQuotedProjectApiKeysTableRef,
  getQuotedProjectsTableRef,
  PROJECT_API_KEYS_TABLE_NAME,
  quotePgIdentifier,
} from "@/lib/control-schema"
import { ensureDbBootstrap } from "@/lib/db-bootstrap-cache"
import { ensureProjectsTable } from "@/lib/projects"

export type ProjectApiKeyType = "anon" | "service_role"

export type ProjectApiKeyRecord = {
  id: string
  name: string
  type: ProjectApiKeyType
  key: string
  created_at: string
  last_used?: string
}

type ProjectApiKeyRow = {
  project_id: number
  key_type: ProjectApiKeyType
  key_encrypted: string
  created_at: string
  updated_at: string
  last_used_at: string | null
}

function getBootstrapKey(client: PoolClient, suffix: string) {
  const connection = client as PoolClient & {
    connectionParameters?: {
      host?: string
      port?: number | string
      database?: string
    }
  }
  return [
    connection.connectionParameters?.host || "",
    String(connection.connectionParameters?.port || ""),
    connection.connectionParameters?.database || "",
    getControlSchema(),
    suffix,
  ].join("::")
}

function getEncryptionKey() {
  const seed =
    process.env.AUTH_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    `${process.env.DATABASE_URL ?? ""}|${process.cwd()}|powerbase-project-api-keys`
  return createHash("sha256").update(seed).digest()
}

function encryptKey(value: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString("base64url")
}

function decryptKey(payload: string): string {
  const buffer = Buffer.from(payload, "base64url")
  const iv = buffer.subarray(0, 12)
  const tag = buffer.subarray(12, 28)
  const encrypted = buffer.subarray(28)
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")
}

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url")
}

function createSigningSecret() {
  return randomBytes(32).toString("base64url")
}

function buildProjectJwt(projectRef: string, role: ProjectApiKeyType, signingSecret: string) {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: "HS256", typ: "JWT" }
  const payload = {
    iss: "powerbase",
    ref: projectRef,
    role,
    iat: now,
    exp: now + 60 * 60 * 24 * 365 * 10,
  }
  const encodedHeader = base64UrlJson(header)
  const encodedPayload = base64UrlJson(payload)
  const signature = createHmac("sha256", signingSecret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url")
  return `${encodedHeader}.${encodedPayload}.${signature}`
}

function getKeyDisplayName(type: ProjectApiKeyType) {
  return type === "anon" ? "anon public" : "service_role"
}

export function getProjectApiBaseUrl(projectRef: string, requestOrigin?: string | null) {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    requestOrigin?.trim() ||
    ""
  const base = configured.replace(/\/$/, "")
  if (!base) {
    return `/api/projects/${projectRef}/rest/v1`
  }
  return `${base}/api/projects/${projectRef}/rest/v1`
}

export async function ensureProjectApiKeysTable(client: PoolClient) {
  await ensureProjectsTable(client)

  await ensureDbBootstrap(getBootstrapKey(client, "project-api-keys"), async () => {
    await ensureControlSchema(client)

    const tableRef = getQuotedProjectApiKeysTableRef()
    const projectsRef = getQuotedProjectsTableRef()

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${tableRef} (
        project_id integer NOT NULL REFERENCES ${projectsRef} (id) ON DELETE CASCADE,
        key_type text NOT NULL CHECK (key_type IN ('anon', 'service_role')),
        key_encrypted text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        last_used_at timestamptz NULL,
        PRIMARY KEY (project_id, key_type)
      )
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS ${quotePgIdentifier(`${PROJECT_API_KEYS_TABLE_NAME}_project_id_idx`)}
      ON ${tableRef} (project_id)
    `)
  })
}

async function getProjectRef(client: PoolClient, projectId: number) {
  const result = await client.query<{ project_ref: string }>(
    `
      SELECT project_ref
      FROM ${getQuotedProjectsTableRef()}
      WHERE id = $1
      LIMIT 1
    `,
    [projectId]
  )
  return result.rows[0]?.project_ref ?? null
}

async function insertProjectApiKey(
  client: PoolClient,
  projectId: number,
  keyType: ProjectApiKeyType,
  projectRef: string
) {
  const signingSecret = createSigningSecret()
  const jwt = buildProjectJwt(projectRef, keyType, signingSecret)
  const keyEncrypted = encryptKey(jwt)

  await client.query(
    `
      INSERT INTO ${getQuotedProjectApiKeysTableRef()} (
        project_id,
        key_type,
        key_encrypted,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, now(), now())
      ON CONFLICT (project_id, key_type) DO NOTHING
    `,
    [projectId, keyType, keyEncrypted]
  )
}

export async function ensureProjectApiKeys(
  client: PoolClient,
  projectId: number,
  projectRef?: string | null
) {
  await ensureProjectApiKeysTable(client)

  const ref = projectRef ?? (await getProjectRef(client, projectId))
  if (!ref) {
    throw new Error("Project reference is required to create API keys")
  }

  const existing = await client.query<{ key_type: ProjectApiKeyType }>(
    `
      SELECT key_type
      FROM ${getQuotedProjectApiKeysTableRef()}
      WHERE project_id = $1
    `,
    [projectId]
  )

  const existingTypes = new Set(existing.rows.map((row) => row.key_type))
  const required: ProjectApiKeyType[] = ["anon", "service_role"]

  for (const keyType of required) {
    if (!existingTypes.has(keyType)) {
      await insertProjectApiKey(client, projectId, keyType, ref)
    }
  }
}

export async function backfillProjectApiKeys(client: PoolClient) {
  await ensureProjectApiKeysTable(client)

  const projects = await client.query<{ id: number; project_ref: string }>(
    `
      SELECT id, project_ref
      FROM ${getQuotedProjectsTableRef()}
      WHERE project_ref IS NOT NULL
      ORDER BY id
    `
  )

  for (const project of projects.rows) {
    await ensureProjectApiKeys(client, project.id, project.project_ref)
  }
}

function rowToRecord(row: ProjectApiKeyRow): ProjectApiKeyRecord {
  return {
    id: `${row.project_id}-${row.key_type}`,
    name: getKeyDisplayName(row.key_type),
    type: row.key_type,
    key: decryptKey(row.key_encrypted),
    created_at: row.created_at,
    last_used: row.last_used_at ?? undefined,
  }
}

export async function listProjectApiKeys(client: PoolClient, projectId: number) {
  await ensureProjectApiKeys(client, projectId)

  const result = await client.query<ProjectApiKeyRow>(
    `
      SELECT
        project_id,
        key_type,
        key_encrypted,
        created_at::text,
        updated_at::text,
        last_used_at::text
      FROM ${getQuotedProjectApiKeysTableRef()}
      WHERE project_id = $1
      ORDER BY CASE key_type WHEN 'anon' THEN 0 ELSE 1 END
    `,
    [projectId]
  )

  return result.rows.map(rowToRecord)
}

export async function regenerateProjectApiKey(
  client: PoolClient,
  projectId: number,
  keyType: ProjectApiKeyType,
  projectRef?: string | null
) {
  await ensureProjectApiKeysTable(client)

  const ref = projectRef ?? (await getProjectRef(client, projectId))
  if (!ref) {
    throw new Error("Project reference is required to regenerate API keys")
  }

  const signingSecret = createSigningSecret()
  const jwt = buildProjectJwt(ref, keyType, signingSecret)
  const keyEncrypted = encryptKey(jwt)

  await client.query(
    `
      INSERT INTO ${getQuotedProjectApiKeysTableRef()} (
        project_id,
        key_type,
        key_encrypted,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, now(), now())
      ON CONFLICT (project_id, key_type)
      DO UPDATE
      SET key_encrypted = EXCLUDED.key_encrypted,
          updated_at = now(),
          last_used_at = NULL
    `,
    [projectId, keyType, keyEncrypted]
  )

  const rows = await client.query<ProjectApiKeyRow>(
    `
      SELECT
        project_id,
        key_type,
        key_encrypted,
        created_at::text,
        updated_at::text,
        last_used_at::text
      FROM ${getQuotedProjectApiKeysTableRef()}
      WHERE project_id = $1
        AND key_type = $2
      LIMIT 1
    `,
    [projectId, keyType]
  )

  const row = rows.rows[0]
  if (!row) {
    throw new Error("Failed to regenerate API key")
  }

  return rowToRecord(row)
}
