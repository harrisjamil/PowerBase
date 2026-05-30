import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

function parseHostname(host: string): string {
  const trimmed = host.trim().toLowerCase()
  if (trimmed.startsWith("[") && trimmed.includes("]")) {
    return trimmed.slice(1, trimmed.indexOf("]"))
  }
  return trimmed.split(":")[0] ?? trimmed
}

function isPrivateOrReservedIp(ip: string): boolean {
  if (ip === "0.0.0.0" || ip === "::" || ip === "::1" || ip === "127.0.0.1") {
    return true
  }

  if (isIP(ip) === 4) {
    const parts = ip.split(".").map(Number)
    const [a, b] = parts
    if (a === 10) return true
    if (a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    return false
  }

  if (isIP(ip) === 6) {
    const lower = ip.toLowerCase()
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true
    if (lower.startsWith("fe80")) return true
    if (lower.startsWith("::ffff:")) {
      const mapped = lower.slice("::ffff:".length)
      if (isIP(mapped) === 4) {
        return isPrivateOrReservedIp(mapped)
      }
    }
  }

  return false
}

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  if (
    lower === "localhost" ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".local") ||
    lower === "metadata.google.internal" ||
    lower.endsWith(".internal")
  ) {
    return true
  }
  return false
}

export async function assertSafeOutboundHost(
  host: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const hostname = parseHostname(host)
  if (!hostname) {
    return { ok: false, error: "Invalid host." }
  }

  if (isBlockedHostname(hostname)) {
    return { ok: false, error: "Connections to local or metadata hosts are not allowed." }
  }

  const ipVersion = isIP(hostname)
  if (ipVersion) {
    if (isPrivateOrReservedIp(hostname)) {
      return { ok: false, error: "Connections to private or reserved IP addresses are not allowed." }
    }
    return { ok: true }
  }

  try {
    const records = await lookup(hostname, { all: true })
    for (const record of records) {
      if (isPrivateOrReservedIp(record.address)) {
        return {
          ok: false,
          error: "Host resolves to a private or reserved IP address.",
        }
      }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: "Could not resolve host." }
  }
}

export function assertSafeWebhookUrl(
  rawUrl: string
): { ok: true; url: URL } | { ok: false; error: string } {
  let parsed: URL
  try {
    parsed = new URL(rawUrl.trim())
  } catch {
    return { ok: false, error: "Invalid webhook URL." }
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, error: "Webhook URLs must use HTTPS." }
  }

  if (parsed.username || parsed.password) {
    return { ok: false, error: "Webhook URL must not contain credentials." }
  }

  return { ok: true, url: parsed }
}

export function isCustomSshHostAllowed(): boolean {
  if (process.env.NODE_ENV !== "production") {
    return true
  }
  return process.env.VM_SSH_ALLOW_CUSTOM_HOST?.trim() === "1"
}
