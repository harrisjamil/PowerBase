import { readVmLocalSettings } from "@/lib/vm-local-settings"
import {
  buildPostgresUrl,
  parsePostgresUrl,
  type ParsedDbUrl,
} from "@/lib/postgres-url"

export type { ParsedDbUrl }

export function getEnvParsed(): ParsedDbUrl {
  const url = process.env.DATABASE_URL
  if (!url) {
    return {
      user: "",
      password: "",
      host: "",
      port: "5432",
      database: "postgres",
    }
  }
  return parsePostgresUrl(url)
}

/** Parsed URL from DATABASE_URL with optional host/port overrides from vm-settings.json. */
export function getEffectiveParsed(): ParsedDbUrl {
  const base = getEnvParsed()
  const local = readVmLocalSettings()
  const host = local.host?.trim() || base.host
  const port = local.port?.trim() || base.port
  return { ...base, host, port }
}

export function getEffectiveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (!url) return ""
  return buildPostgresUrl(getEffectiveParsed())
}
