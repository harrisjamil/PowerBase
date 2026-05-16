import type { PoolClient } from "pg"
import {
  ensureControlSchema,
  getControlSchema,
  getQuotedPlatformSettingsTableRef,
  quotePgIdentifier,
} from "@/lib/control-schema"
import { ensureDbBootstrap } from "@/lib/db-bootstrap-cache"

export type PlatformSecuritySettings = {
  twoFactorRequired: boolean
  sessionTimeoutMinutes: number
  maxLoginAttempts: number
  passwordExpiryDays: number
}

export type PlatformGeneralSettings = {
  platformName: string
  platformUrl: string
  supportEmail: string
  timezone: string
  dateFormat: string
}

export type PlatformNotificationSettings = {
  emailNotifications: boolean
  newUserAlert: boolean
  securityAlerts: boolean
  systemUpdates: boolean
}

const DEFAULT_SECURITY: PlatformSecuritySettings = {
  twoFactorRequired: false,
  sessionTimeoutMinutes: 60,
  maxLoginAttempts: 5,
  passwordExpiryDays: 90,
}

const DEFAULT_GENERAL: PlatformGeneralSettings = {
  platformName: "PowerBase",
  platformUrl: "",
  supportEmail: "",
  timezone: "UTC",
  dateFormat: "YYYY-MM-DD",
}

const DEFAULT_NOTIFICATIONS: PlatformNotificationSettings = {
  emailNotifications: true,
  newUserAlert: true,
  securityAlerts: true,
  systemUpdates: false,
}

const ALLOWED_TIMEZONES = new Set([
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Asia/Dubai",
])

const ALLOWED_DATE_FORMATS = new Set(["YYYY-MM-DD", "MM/DD/YYYY", "DD/MM/YYYY"])

function getBootstrapKey(client: PoolClient) {
  return `${getControlSchema()}::platform-settings`
}

export async function ensurePlatformSettingsTable(client: PoolClient) {
  await ensureControlSchema(client)
  await ensureDbBootstrap(getBootstrapKey(client), async () => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${getQuotedPlatformSettingsTableRef()} (
        id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        two_factor_required boolean NOT NULL DEFAULT false,
        session_timeout_minutes integer NOT NULL DEFAULT 60,
        max_login_attempts integer NOT NULL DEFAULT 5,
        password_expiry_days integer NOT NULL DEFAULT 90,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await client.query(`
      INSERT INTO ${getQuotedPlatformSettingsTableRef()} (id)
      VALUES (1)
      ON CONFLICT (id) DO NOTHING
    `)

    const alterColumns = [
      "platform_name text NOT NULL DEFAULT 'PowerBase'",
      "platform_url text NOT NULL DEFAULT ''",
      "support_email text NOT NULL DEFAULT ''",
      "timezone text NOT NULL DEFAULT 'UTC'",
      "date_format text NOT NULL DEFAULT 'YYYY-MM-DD'",
      "email_notifications boolean NOT NULL DEFAULT true",
      "new_user_alert boolean NOT NULL DEFAULT true",
      "security_alerts boolean NOT NULL DEFAULT true",
      "system_updates boolean NOT NULL DEFAULT false",
    ]

    for (const definition of alterColumns) {
      const columnName = definition.split(" ")[0]
      await client.query(
        `ALTER TABLE ${getQuotedPlatformSettingsTableRef()} ADD COLUMN IF NOT EXISTS ${quotePgIdentifier(columnName)} ${definition.slice(columnName.length + 1)}`
      )
    }
  })
}

type PlatformSettingsRow = {
  two_factor_required: boolean
  session_timeout_minutes: number
  max_login_attempts: number
  password_expiry_days: number
  platform_name: string | null
  platform_url: string | null
  support_email: string | null
  timezone: string | null
  date_format: string | null
  email_notifications: boolean | null
  new_user_alert: boolean | null
  security_alerts: boolean | null
  system_updates: boolean | null
}

async function getPlatformSettingsRow(client: PoolClient): Promise<PlatformSettingsRow | null> {
  await ensurePlatformSettingsTable(client)
  const result = await client.query<PlatformSettingsRow>(`
    SELECT
      two_factor_required,
      session_timeout_minutes,
      max_login_attempts,
      password_expiry_days,
      platform_name,
      platform_url,
      support_email,
      timezone,
      date_format,
      email_notifications,
      new_user_alert,
      security_alerts,
      system_updates
    FROM ${getQuotedPlatformSettingsTableRef()}
    WHERE id = 1
  `)
  return result.rows[0] ?? null
}

export async function getPlatformSecuritySettings(
  client: PoolClient
): Promise<PlatformSecuritySettings> {
  const row = await getPlatformSettingsRow(client)
  if (!row) return { ...DEFAULT_SECURITY }

  return {
    twoFactorRequired: Boolean(row.two_factor_required),
    sessionTimeoutMinutes: Number(row.session_timeout_minutes) || DEFAULT_SECURITY.sessionTimeoutMinutes,
    maxLoginAttempts: Number(row.max_login_attempts) || DEFAULT_SECURITY.maxLoginAttempts,
    passwordExpiryDays: Number(row.password_expiry_days) || DEFAULT_SECURITY.passwordExpiryDays,
  }
}

export async function getPlatformGeneralSettings(
  client: PoolClient
): Promise<PlatformGeneralSettings> {
  const row = await getPlatformSettingsRow(client)
  if (!row) return { ...DEFAULT_GENERAL }

  const timezone =
    row.timezone && ALLOWED_TIMEZONES.has(row.timezone) ? row.timezone : DEFAULT_GENERAL.timezone
  const dateFormat =
    row.date_format && ALLOWED_DATE_FORMATS.has(row.date_format)
      ? row.date_format
      : DEFAULT_GENERAL.dateFormat

  return {
    platformName: row.platform_name?.trim() || DEFAULT_GENERAL.platformName,
    platformUrl: row.platform_url?.trim() ?? DEFAULT_GENERAL.platformUrl,
    supportEmail: row.support_email?.trim() ?? DEFAULT_GENERAL.supportEmail,
    timezone,
    dateFormat,
  }
}

export async function getPlatformNotificationSettings(
  client: PoolClient
): Promise<PlatformNotificationSettings> {
  const row = await getPlatformSettingsRow(client)
  if (!row) return { ...DEFAULT_NOTIFICATIONS }

  return {
    emailNotifications:
      row.email_notifications === null ? DEFAULT_NOTIFICATIONS.emailNotifications : Boolean(row.email_notifications),
    newUserAlert:
      row.new_user_alert === null ? DEFAULT_NOTIFICATIONS.newUserAlert : Boolean(row.new_user_alert),
    securityAlerts:
      row.security_alerts === null ? DEFAULT_NOTIFICATIONS.securityAlerts : Boolean(row.security_alerts),
    systemUpdates:
      row.system_updates === null ? DEFAULT_NOTIFICATIONS.systemUpdates : Boolean(row.system_updates),
  }
}

export async function updatePlatformSecuritySettings(
  client: PoolClient,
  settings: Partial<PlatformSecuritySettings>
) {
  await ensurePlatformSettingsTable(client)

  const current = await getPlatformSecuritySettings(client)
  const next: PlatformSecuritySettings = {
    twoFactorRequired: settings.twoFactorRequired ?? current.twoFactorRequired,
    sessionTimeoutMinutes: settings.sessionTimeoutMinutes ?? current.sessionTimeoutMinutes,
    maxLoginAttempts: settings.maxLoginAttempts ?? current.maxLoginAttempts,
    passwordExpiryDays: settings.passwordExpiryDays ?? current.passwordExpiryDays,
  }

  await client.query(
    `
      UPDATE ${getQuotedPlatformSettingsTableRef()}
      SET
        two_factor_required = $1,
        session_timeout_minutes = $2,
        max_login_attempts = $3,
        password_expiry_days = $4,
        updated_at = now()
      WHERE id = 1
    `,
    [
      next.twoFactorRequired,
      next.sessionTimeoutMinutes,
      next.maxLoginAttempts,
      next.passwordExpiryDays,
    ]
  )

  return next
}

export async function updatePlatformGeneralSettings(
  client: PoolClient,
  settings: Partial<PlatformGeneralSettings>
) {
  await ensurePlatformSettingsTable(client)

  const current = await getPlatformGeneralSettings(client)
  const next: PlatformGeneralSettings = {
    platformName: settings.platformName ?? current.platformName,
    platformUrl: settings.platformUrl ?? current.platformUrl,
    supportEmail: settings.supportEmail ?? current.supportEmail,
    timezone: settings.timezone ?? current.timezone,
    dateFormat: settings.dateFormat ?? current.dateFormat,
  }

  const platformName = readPlatformName(next.platformName)
  if (!platformName) {
    throw new Error("Platform name is required")
  }

  const platformUrl = readPlatformUrl(next.platformUrl)
  if (platformUrl === null) {
    throw new Error("Platform URL is invalid")
  }

  const supportEmail = readSupportEmail(next.supportEmail)
  if (supportEmail === null) {
    throw new Error("Support email is invalid")
  }

  const timezone = readTimezone(next.timezone)
  const dateFormat = readDateFormat(next.dateFormat)

  await client.query(
    `
      UPDATE ${getQuotedPlatformSettingsTableRef()}
      SET
        platform_name = $1,
        platform_url = $2,
        support_email = $3,
        timezone = $4,
        date_format = $5,
        updated_at = now()
      WHERE id = 1
    `,
    [platformName, platformUrl, supportEmail, timezone, dateFormat]
  )

  return {
    platformName,
    platformUrl,
    supportEmail,
    timezone,
    dateFormat,
  }
}

export async function updatePlatformNotificationSettings(
  client: PoolClient,
  settings: Partial<PlatformNotificationSettings>
) {
  await ensurePlatformSettingsTable(client)

  const current = await getPlatformNotificationSettings(client)
  const next: PlatformNotificationSettings = {
    emailNotifications: settings.emailNotifications ?? current.emailNotifications,
    newUserAlert: settings.newUserAlert ?? current.newUserAlert,
    securityAlerts: settings.securityAlerts ?? current.securityAlerts,
    systemUpdates: settings.systemUpdates ?? current.systemUpdates,
  }

  await client.query(
    `
      UPDATE ${getQuotedPlatformSettingsTableRef()}
      SET
        email_notifications = $1,
        new_user_alert = $2,
        security_alerts = $3,
        system_updates = $4,
        updated_at = now()
      WHERE id = 1
    `,
    [next.emailNotifications, next.newUserAlert, next.securityAlerts, next.systemUpdates]
  )

  return next
}

export function readPositiveInt(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value)
    if (parsed > 0) return parsed
  }
  return fallback
}

export function readPlatformName(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 120) return null
  return trimmed
}

export function readPlatformUrl(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return ""
  try {
    const parsed = new URL(trimmed)
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null
    }
    return trimmed
  } catch {
    return null
  }
}

export function readSupportEmail(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return ""
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) || trimmed.length > 254) {
    return null
  }
  return trimmed
}

export function readTimezone(value: unknown): string {
  if (typeof value === "string" && ALLOWED_TIMEZONES.has(value)) {
    return value
  }
  return DEFAULT_GENERAL.timezone
}

export function readDateFormat(value: unknown): string {
  if (typeof value === "string" && ALLOWED_DATE_FORMATS.has(value)) {
    return value
  }
  return DEFAULT_GENERAL.dateFormat
}

export function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback
}
