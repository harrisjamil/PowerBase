import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import type { PoolClient } from "pg"
import {
  ensureControlSchema,
  getControlSchema,
  getQuotedPlatformIntegrationsTableRef,
  quotePgIdentifier,
} from "@/lib/control-schema"
import { ensureDbBootstrap } from "@/lib/db-bootstrap-cache"
import { getCatalogIntegration } from "@/lib/integration-catalog"

export type IntegrationType = "oauth" | "api_key" | "webhook"
export type IntegrationStatus = "connected" | "disconnected" | "error"

export type IntegrationSecrets = {
  apiKey?: string
  apiSecret?: string
  webhookSecret?: string
  clientId?: string
}

export type IntegrationPublicConfig = {
  webhookUrl?: string
  events?: string[]
  apiKey?: string
  apiSecret?: string
  clientId?: string
}

export type PlatformIntegration = {
  id: string
  providerId: string
  name: string
  type: IntegrationType
  status: IntegrationStatus
  description: string
  icon: string
  lastUsedAt: string | null
  errorMessage: string | null
  config: IntegrationPublicConfig
  createdAt: string
  updatedAt: string
}

type IntegrationRow = {
  id: string
  provider_id: string
  name: string
  integration_type: string
  status: string
  description: string
  icon: string
  config: IntegrationPublicConfig | null
  secrets_encrypted: string | null
  events: string[] | null
  last_used_at: Date | string | null
  error_message: string | null
  created_at: Date | string
  updated_at: Date | string
}

export type CreateIntegrationInput = {
  providerId?: string
  name: string
  type: IntegrationType
  description?: string
  icon?: string
  webhookUrl?: string
  events?: string[]
  apiKey?: string
  apiSecret?: string
  webhookSecret?: string
  clientId?: string
  connectFromCatalog?: boolean
}

export type UpdateIntegrationInput = {
  name?: string
  status?: IntegrationStatus
  description?: string
  webhookUrl?: string
  events?: string[]
  apiKey?: string
  apiSecret?: string
  webhookSecret?: string
  clientId?: string
  errorMessage?: string | null
}

const WEBHOOK_EVENTS = [
  "user.created",
  "user.updated",
  "user.deleted",
  "data.synced",
  "alert.triggered",
] as const

function getBootstrapKey() {
  return `${getControlSchema()}::platform-integrations`
}

function getEncryptionKey() {
  const seed =
    process.env.AUTH_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    `${process.env.DATABASE_URL ?? ""}|${process.cwd()}|powerbase-integrations`
  return createHash("sha256").update(seed).digest()
}

function encryptSecrets(secrets: IntegrationSecrets): string {
  const payload = JSON.stringify(secrets)
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString("base64url")
}

function decryptSecrets(payload: string | null): IntegrationSecrets {
  if (!payload) return {}
  try {
    const buffer = Buffer.from(payload, "base64url")
    const iv = buffer.subarray(0, 12)
    const tag = buffer.subarray(12, 28)
    const encrypted = buffer.subarray(28)
    const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv)
    decipher.setAuthTag(tag)
    const json = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")
    return JSON.parse(json) as IntegrationSecrets
  } catch {
    return {}
  }
}

function maskSecret(value: string | undefined) {
  if (!value) return undefined
  if (value.length <= 8) return "****"
  return `${value.slice(0, 4)}****${value.slice(-2)}`
}

function toIsoString(value: Date | string | null) {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function readIntegrationType(value: unknown): IntegrationType | null {
  return value === "oauth" || value === "api_key" || value === "webhook" ? value : null
}

function readIntegrationStatus(value: unknown): IntegrationStatus | null {
  return value === "connected" || value === "disconnected" || value === "error" ? value : null
}

function readName(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 120) return null
  return trimmed
}

function readDescription(value: unknown): string {
  if (typeof value !== "string") return ""
  return value.trim().slice(0, 500)
}

function readIcon(value: unknown): string {
  if (typeof value !== "string") return "plug"
  const trimmed = value.trim().slice(0, 40)
  return trimmed || "plug"
}

function readWebhookUrl(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed)
    if (!["http:", "https:"].includes(parsed.protocol)) return null
    return trimmed
  } catch {
    return null
  }
}

function readEvents(value: unknown): string[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value)) return null
  const events = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => WEBHOOK_EVENTS.includes(item as (typeof WEBHOOK_EVENTS)[number]))
  return Array.from(new Set(events))
}

function readOptionalSecret(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 2048) return undefined
  return trimmed
}

function buildPublicConfig(
  row: IntegrationRow,
  secrets: IntegrationSecrets
): IntegrationPublicConfig {
  const config = row.config ?? {}
  return {
    webhookUrl: config.webhookUrl,
    events: row.events ?? config.events ?? [],
    apiKey: maskSecret(secrets.apiKey),
    apiSecret: maskSecret(secrets.apiSecret),
    clientId: secrets.clientId ? maskSecret(secrets.clientId) : config.clientId,
  }
}

function mapRow(row: IntegrationRow): PlatformIntegration {
  const secrets = decryptSecrets(row.secrets_encrypted)
  return {
    id: row.id,
    providerId: row.provider_id,
    name: row.name,
    type: readIntegrationType(row.integration_type) ?? "api_key",
    status: readIntegrationStatus(row.status) ?? "disconnected",
    description: row.description,
    icon: row.icon,
    lastUsedAt: toIsoString(row.last_used_at),
    errorMessage: row.error_message,
    config: buildPublicConfig(row, secrets),
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
  }
}

export async function ensurePlatformIntegrationsTable(client: PoolClient) {
  await ensureControlSchema(client)
  await ensureDbBootstrap(getBootstrapKey(), async () => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${getQuotedPlatformIntegrationsTableRef()} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id text NOT NULL,
        name text NOT NULL,
        integration_type text NOT NULL,
        status text NOT NULL DEFAULT 'connected',
        description text NOT NULL DEFAULT '',
        icon text NOT NULL DEFAULT 'plug',
        config jsonb NOT NULL DEFAULT '{}'::jsonb,
        secrets_encrypted text,
        events text[] NOT NULL DEFAULT '{}',
        last_used_at timestamptz,
        error_message text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await client.query(`
      CREATE INDEX IF NOT EXISTS ${quotePgIdentifier("platform_integrations_provider_idx")}
      ON ${getQuotedPlatformIntegrationsTableRef()} (provider_id)
    `)
  })
}

export async function listPlatformIntegrations(client: PoolClient): Promise<PlatformIntegration[]> {
  await ensurePlatformIntegrationsTable(client)
  const result = await client.query<IntegrationRow>(`
    SELECT
      id,
      provider_id,
      name,
      integration_type,
      status,
      description,
      icon,
      config,
      secrets_encrypted,
      events,
      last_used_at,
      error_message,
      created_at,
      updated_at
    FROM ${getQuotedPlatformIntegrationsTableRef()}
    ORDER BY created_at DESC
  `)
  return result.rows.map(mapRow)
}

export async function getPlatformIntegrationById(
  client: PoolClient,
  id: string
): Promise<PlatformIntegration | null> {
  await ensurePlatformIntegrationsTable(client)
  const result = await client.query<IntegrationRow>(
    `
      SELECT
        id,
        provider_id,
        name,
        integration_type,
        status,
        description,
        icon,
        config,
        secrets_encrypted,
        events,
        last_used_at,
        error_message,
        created_at,
        updated_at
      FROM ${getQuotedPlatformIntegrationsTableRef()}
      WHERE id = $1::uuid
    `,
    [id]
  )
  const row = result.rows[0]
  return row ? mapRow(row) : null
}

async function findCatalogConflict(client: PoolClient, providerId: string, excludeId?: string) {
  const result = await client.query<{ id: string }>(
    `
      SELECT id
      FROM ${getQuotedPlatformIntegrationsTableRef()}
      WHERE provider_id = $1
        AND status = 'connected'
        AND ($2::uuid IS NULL OR id <> $2::uuid)
      LIMIT 1
    `,
    [providerId, excludeId ?? null]
  )
  return result.rows[0]?.id ?? null
}

export async function createPlatformIntegration(
  client: PoolClient,
  input: CreateIntegrationInput
): Promise<PlatformIntegration> {
  await ensurePlatformIntegrationsTable(client)

  let providerId = input.providerId?.trim() || ""
  let name = readName(input.name)
  let type = readIntegrationType(input.type)
  let description = readDescription(input.description)
  let icon = readIcon(input.icon)

  if (input.connectFromCatalog) {
    if (!providerId) {
      throw new Error("Provider id is required")
    }
    const catalog = getCatalogIntegration(providerId)
    if (!catalog) {
      throw new Error("Unknown integration provider")
    }
    name = readName(input.name) || catalog.name
    type = catalog.type
    description = catalog.description
    icon = catalog.icon
  }

  if (!name || !type) {
    throw new Error("Integration name and type are required")
  }

  if (!providerId) {
    providerId =
      type === "webhook"
        ? `webhook-${randomBytes(6).toString("hex")}`
        : `custom-${randomBytes(6).toString("hex")}`
  }

  if (getCatalogIntegration(providerId)) {
    const conflict = await findCatalogConflict(client, providerId)
    if (conflict) {
      throw new Error("This integration is already connected")
    }
  }

  const secrets: IntegrationSecrets = {}
  const config: IntegrationPublicConfig = {}
  let events: string[] = []

  if (type === "webhook") {
    const webhookUrl = readWebhookUrl(input.webhookUrl)
    if (!webhookUrl) {
      throw new Error("A valid webhook URL is required")
    }
    config.webhookUrl = webhookUrl
    events = readEvents(input.events) ?? []
    const webhookSecret = readOptionalSecret(input.webhookSecret)
    if (webhookSecret) secrets.webhookSecret = webhookSecret
  }

  if (type === "api_key") {
    const apiKey = readOptionalSecret(input.apiKey)
    if (!apiKey) {
      throw new Error("API key is required")
    }
    secrets.apiKey = apiKey
    const apiSecret = readOptionalSecret(input.apiSecret)
    if (apiSecret) secrets.apiSecret = apiSecret
  }

  if (type === "oauth") {
    const clientId = readOptionalSecret(input.clientId)
    if (clientId) secrets.clientId = clientId
    const apiKey = readOptionalSecret(input.apiKey)
    if (apiKey) secrets.apiKey = apiKey
  }

  const result = await client.query<IntegrationRow>(
    `
      INSERT INTO ${getQuotedPlatformIntegrationsTableRef()} (
        provider_id,
        name,
        integration_type,
        status,
        description,
        icon,
        config,
        secrets_encrypted,
        events
      )
      VALUES ($1, $2, $3, 'connected', $4, $5, $6::jsonb, $7, $8::text[])
      RETURNING
        id,
        provider_id,
        name,
        integration_type,
        status,
        description,
        icon,
        config,
        secrets_encrypted,
        events,
        last_used_at,
        error_message,
        created_at,
        updated_at
    `,
    [
      providerId,
      name,
      type,
      description,
      icon,
      JSON.stringify(config),
      Object.keys(secrets).length > 0 ? encryptSecrets(secrets) : null,
      events,
    ]
  )

  return mapRow(result.rows[0])
}

export async function updatePlatformIntegration(
  client: PoolClient,
  id: string,
  input: UpdateIntegrationInput
): Promise<PlatformIntegration | null> {
  await ensurePlatformIntegrationsTable(client)

  const existing = await client.query<IntegrationRow>(
    `
      SELECT
        id,
        provider_id,
        name,
        integration_type,
        status,
        description,
        icon,
        config,
        secrets_encrypted,
        events,
        last_used_at,
        error_message,
        created_at,
        updated_at
      FROM ${getQuotedPlatformIntegrationsTableRef()}
      WHERE id = $1::uuid
    `,
    [id]
  )

  const row = existing.rows[0]
  if (!row) return null

  const type = readIntegrationType(row.integration_type) ?? "api_key"
  const secrets = decryptSecrets(row.secrets_encrypted)
  const config = { ...(row.config ?? {}) }
  let events = row.events ?? config.events ?? []

  const nextName = input.name === undefined ? row.name : readName(input.name)
  if (!nextName) {
    throw new Error("Integration name is invalid")
  }

  if (input.webhookUrl !== undefined) {
    const webhookUrl = readWebhookUrl(input.webhookUrl)
    if (!webhookUrl) {
      throw new Error("Webhook URL is invalid")
    }
    config.webhookUrl = webhookUrl
  }

  if (input.events !== undefined) {
    const parsedEvents = readEvents(input.events)
    if (parsedEvents === null) {
      throw new Error("Webhook events are invalid")
    }
    events = parsedEvents
  }

  if (input.apiKey !== undefined) {
    const apiKey = readOptionalSecret(input.apiKey)
    if (!apiKey) {
      throw new Error("API key is invalid")
    }
    secrets.apiKey = apiKey
  }

  if (input.apiSecret !== undefined) {
    const apiSecret = readOptionalSecret(input.apiSecret)
    if (apiSecret) secrets.apiSecret = apiSecret
  }

  if (input.webhookSecret !== undefined) {
    const webhookSecret = readOptionalSecret(input.webhookSecret)
    if (webhookSecret) secrets.webhookSecret = webhookSecret
  }

  if (input.clientId !== undefined) {
    const clientId = readOptionalSecret(input.clientId)
    if (clientId) secrets.clientId = clientId
  }

  const nextStatus = input.status ?? readIntegrationStatus(row.status) ?? "disconnected"

  if (nextStatus === "connected" && type === "api_key" && !secrets.apiKey) {
    throw new Error("API key is required to connect this integration")
  }

  if (nextStatus === "connected" && type === "webhook" && !config.webhookUrl) {
    throw new Error("Webhook URL is required to connect this integration")
  }

  const result = await client.query<IntegrationRow>(
    `
      UPDATE ${getQuotedPlatformIntegrationsTableRef()}
      SET
        name = $2,
        status = $3,
        description = $4,
        config = $5::jsonb,
        secrets_encrypted = $6,
        events = $7::text[],
        error_message = $8,
        updated_at = now()
      WHERE id = $1::uuid
      RETURNING
        id,
        provider_id,
        name,
        integration_type,
        status,
        description,
        icon,
        config,
        secrets_encrypted,
        events,
        last_used_at,
        error_message,
        created_at,
        updated_at
    `,
    [
      id,
      nextName,
      nextStatus,
      input.description === undefined ? row.description : readDescription(input.description),
      JSON.stringify(config),
      Object.keys(secrets).length > 0 ? encryptSecrets(secrets) : null,
      events,
      input.errorMessage === undefined ? row.error_message : input.errorMessage,
    ]
  )

  return mapRow(result.rows[0])
}

export async function deletePlatformIntegration(client: PoolClient, id: string): Promise<boolean> {
  await ensurePlatformIntegrationsTable(client)
  const result = await client.query(
    `DELETE FROM ${getQuotedPlatformIntegrationsTableRef()} WHERE id = $1::uuid`,
    [id]
  )
  return (result.rowCount ?? 0) > 0
}

export async function touchIntegrationLastUsed(client: PoolClient, id: string) {
  await ensurePlatformIntegrationsTable(client)
  await client.query(
    `
      UPDATE ${getQuotedPlatformIntegrationsTableRef()}
      SET last_used_at = now(), updated_at = now()
      WHERE id = $1::uuid
    `,
    [id]
  )
}

export async function testPlatformWebhook(
  client: PoolClient,
  id: string
): Promise<{ ok: boolean; statusCode?: number; error?: string }> {
  const integration = await getPlatformIntegrationById(client, id)
  if (!integration || integration.type !== "webhook") {
    return { ok: false, error: "Webhook integration not found" }
  }

  const url = integration.config.webhookUrl
  if (!url) {
    return { ok: false, error: "Webhook URL is not configured" }
  }

  const secrets = decryptSecrets(
    (
      await client.query<{ secrets_encrypted: string | null }>(
        `SELECT secrets_encrypted FROM ${getQuotedPlatformIntegrationsTableRef()} WHERE id = $1::uuid`,
        [id]
      )
    ).rows[0]?.secrets_encrypted ?? null
  )

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secrets.webhookSecret
          ? { "X-PowerBase-Signature": createHash("sha256").update(secrets.webhookSecret).digest("hex") }
          : {}),
      },
      body: JSON.stringify({
        event: "integration.test",
        timestamp: new Date().toISOString(),
        data: { integrationId: id, message: "PowerBase webhook test" },
      }),
      signal: AbortSignal.timeout(10_000),
    })

    if (response.ok) {
      await touchIntegrationLastUsed(client, id)
      return { ok: true, statusCode: response.status }
    }

    await updatePlatformIntegration(client, id, {
      status: "error",
      errorMessage: `Endpoint returned HTTP ${response.status}`,
    })
    return { ok: false, statusCode: response.status, error: `Endpoint returned HTTP ${response.status}` }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook test failed"
    await updatePlatformIntegration(client, id, {
      status: "error",
      errorMessage: message,
    })
    return { ok: false, error: message }
  }
}

export function parseCreateIntegrationBody(body: Record<string, unknown>): CreateIntegrationInput | null {
  const name = readName(body.name)
  const type = readIntegrationType(body.type)
  if (!type && !body.connectFromCatalog) return null

  return {
    providerId: typeof body.providerId === "string" ? body.providerId : undefined,
    name: name ?? "",
    type: type ?? "oauth",
    description: readDescription(body.description),
    icon: readIcon(body.icon),
    webhookUrl: typeof body.webhookUrl === "string" ? body.webhookUrl : undefined,
    events: Array.isArray(body.events) ? body.events : undefined,
    apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
    apiSecret: typeof body.apiSecret === "string" ? body.apiSecret : undefined,
    webhookSecret: typeof body.webhookSecret === "string" ? body.webhookSecret : undefined,
    clientId: typeof body.clientId === "string" ? body.clientId : undefined,
    connectFromCatalog: body.connectFromCatalog === true,
  }
}
