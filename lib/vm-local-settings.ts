import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const SETTINGS_DIR = path.join(process.cwd(), ".powerbase")
const SETTINGS_FILE = path.join(SETTINGS_DIR, "vm-settings.json")

export type VmLocalSettings = {
  /** Friendly label for this VM in the admin UI only. */
  displayName?: string
  /** Override PostgreSQL host from DATABASE_URL (optional). */
  host?: string
  /** Override PostgreSQL port from DATABASE_URL (optional). */
  port?: string
  /** Schema used for app-level superadmin credentials/logins. */
  controlSchema?: string
}

function normalizeRead(raw: unknown): VmLocalSettings {
  if (!raw || typeof raw !== "object") return {}
  const o = raw as Record<string, unknown>
  const out: VmLocalSettings = {}
  if (typeof o.displayName === "string") {
    const d = o.displayName.trim().slice(0, 128)
    if (d) out.displayName = d
  }
  if (typeof o.host === "string") {
    const h = o.host.trim().slice(0, 255)
    if (h) out.host = h
  }
  if (typeof o.port === "string") {
    const p = o.port.trim()
    if (p && /^\d+$/.test(p)) out.port = p
  }
  if (typeof o.controlSchema === "string") {
    const s = o.controlSchema.trim().slice(0, 63)
    if (s && /^[A-Za-z_][A-Za-z0-9_$]*$/.test(s)) out.controlSchema = s
  }
  return out
}

export function readVmLocalSettings(): VmLocalSettings {
  try {
    if (!existsSync(SETTINGS_FILE)) return {}
    const raw = readFileSync(SETTINGS_FILE, "utf-8")
    const parsed = JSON.parse(raw) as unknown
    return normalizeRead(parsed)
  } catch {
    return {}
  }
}

type VmSettingsPatch = {
  displayName?: string | null
  host?: string | null
  port?: string | null
  controlSchema?: string | null
}

/** Merge patch into vm-settings.json. Use `null` or empty string on a key to remove it. */
export function patchVmLocalSettings(patch: VmSettingsPatch) {
  const cur = readVmLocalSettings()
  const next: VmLocalSettings = { ...cur }

  if ("displayName" in patch) {
    if (patch.displayName === null || patch.displayName === "") {
      delete next.displayName
    } else if (typeof patch.displayName === "string") {
      const d = patch.displayName.trim().slice(0, 128)
      if (d) next.displayName = d
      else delete next.displayName
    }
  }
  if ("host" in patch) {
    if (patch.host === null || patch.host === "") {
      delete next.host
    } else if (typeof patch.host === "string") {
      const h = patch.host.trim().slice(0, 255)
      if (h) next.host = h
      else delete next.host
    }
  }
  if ("port" in patch) {
    if (patch.port === null || patch.port === "") {
      delete next.port
    } else if (typeof patch.port === "string") {
      const p = patch.port.trim()
      if (p && /^\d+$/.test(p)) next.port = p
      else delete next.port
    }
  }
  if ("controlSchema" in patch) {
    if (patch.controlSchema === null || patch.controlSchema === "") {
      delete next.controlSchema
    } else if (typeof patch.controlSchema === "string") {
      const s = patch.controlSchema.trim().slice(0, 63)
      if (s && /^[A-Za-z_][A-Za-z0-9_$]*$/.test(s)) next.controlSchema = s
      else delete next.controlSchema
    }
  }

  mkdirSync(SETTINGS_DIR, { recursive: true })
  writeFileSync(
    SETTINGS_FILE,
    `${JSON.stringify(next, null, 2)}\n`,
    "utf-8"
  )
}
