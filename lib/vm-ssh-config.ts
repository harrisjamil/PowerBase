import { readFileSync } from "node:fs"
import type { ConnectConfig } from "ssh2"

export type VmSshPublicInfo = {
  host: string
  port: number
  username: string
}

export type SshFormDefaults = {
  host: string
  port: number
  username: string
}

/** Values to pre-fill the VM terminal form (no secrets). */
export function getSshUiDefaults(): { defaults: SshFormDefaults; envAuthReady: boolean } {
  const host =
    process.env.VM_SSH_HOST?.trim() ||
    process.env.VM_IP?.trim() ||
    ""
  const p = parseInt(process.env.VM_SSH_PORT?.trim() || "22", 10)
  const port = Number.isFinite(p) && p >= 1 && p <= 65535 ? p : 22
  const username = process.env.VM_SSH_USER?.trim() || ""
  return {
    defaults: { host, port, username },
    envAuthReady: getVmSshConnectConfig().ok,
  }
}

const LINUX_USER_RE = /^[a-zA-Z0-9._-]{1,32}$/

/**
 * Password-based SSH from the browser form. Host may be IPv4, bracketed IPv6, or hostname.
 */
export function buildConnectFromFormCredentials(input: {
  host: string
  port: number
  username: string
  password: string
}): { ok: true; connect: ConnectConfig } | { ok: false; error: string } {
  const host = input.host.trim()
  if (!host || host.length > 253) {
    return { ok: false, error: "Enter a valid host or IP address." }
  }
  if (/[\s#]/.test(host)) {
    return { ok: false, error: "Host cannot contain spaces or #." }
  }

  const port = input.port
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return { ok: false, error: "Port must be between 1 and 65535." }
  }

  const username = input.username.trim()
  if (!LINUX_USER_RE.test(username)) {
    return {
      ok: false,
      error: "Username must be 1–32 characters (letters, numbers, _, -, .).",
    }
  }

  const password = input.password
  if (typeof password !== "string" || password.length === 0) {
    return { ok: false, error: "Password is required." }
  }
  if (password.length > 512) {
    return { ok: false, error: "Password is too long." }
  }

  const connect: ConnectConfig = {
    host,
    port,
    username,
    password,
    readyTimeout: 25_000,
    tryKeyboard: false,
  }

  return { ok: true, connect }
}

/**
 * SSH target for the in-browser “PuTTY” session (Linux shell on the VM).
 * Uses env vars so secrets are not stored in vm-settings.json.
 *
 * - VM_SSH_USER (required)
 * - VM_SSH_HOST or VM_IP (required unless you type the host manually in the UI)
 * - VM_SSH_PORT (optional, default 22)
 * - VM_SSH_PASSWORD and/or VM_SSH_PRIVATE_KEY_PATH or VM_SSH_PRIVATE_KEY (PEM, use \n for newlines in .env)
 * - VM_SSH_PRIVATE_KEY_PASSPHRASE (optional)
 */
export function getVmSshConnectConfig():
  | { ok: true; connect: ConnectConfig; public: VmSshPublicInfo }
  | { ok: false; reason: string } {
  const username = process.env.VM_SSH_USER?.trim()
  if (!username) {
    return {
      ok: false,
      reason:
        "Set VM_SSH_USER to the SSH login on your VM (Linux user). Add VM_SSH_PASSWORD or a private key (see VM terminal page).",
    }
  }

  const host =
    process.env.VM_SSH_HOST?.trim() ||
    process.env.VM_IP?.trim() ||
    ""
  if (!host) {
    return {
      ok: false,
      reason:
        "Set VM_IP or VM_SSH_HOST to the SSH host for your VM.",
    }
  }

  const portRaw = process.env.VM_SSH_PORT?.trim() || "22"
  const port = parseInt(portRaw, 10)
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return { ok: false, reason: "VM_SSH_PORT must be a number between 1 and 65535." }
  }

  const password = process.env.VM_SSH_PASSWORD
  let privateKey: string | undefined
  const keyPath = process.env.VM_SSH_PRIVATE_KEY_PATH?.trim()
  if (keyPath) {
    try {
      privateKey = readFileSync(keyPath, "utf-8")
    } catch {
      return { ok: false, reason: `Could not read VM_SSH_PRIVATE_KEY_PATH: ${keyPath}` }
    }
  }
  const inline = process.env.VM_SSH_PRIVATE_KEY?.trim()
  if (inline) {
    privateKey = inline.replace(/\\n/g, "\n")
  }

  if (!password && !privateKey) {
    return {
      ok: false,
      reason:
        "Provide VM_SSH_PASSWORD and/or VM_SSH_PRIVATE_KEY_PATH (file) or VM_SSH_PRIVATE_KEY (PEM text).",
    }
  }

  const passphrase = process.env.VM_SSH_PRIVATE_KEY_PASSPHRASE

  const connect: ConnectConfig = {
    host,
    port,
    username,
    readyTimeout: 25_000,
    tryKeyboard: false,
  }

  if (password) connect.password = password
  if (privateKey) {
    connect.privateKey = privateKey
    if (passphrase) connect.passphrase = passphrase
  }

  return {
    ok: true,
    connect,
    public: { host, port, username },
  }
}
