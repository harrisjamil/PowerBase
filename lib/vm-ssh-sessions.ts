import { Client } from "ssh2"
import type { ClientChannel } from "ssh2"
import type { ConnectConfig } from "ssh2"
import {
  buildConnectFromFormCredentials,
  getVmSshConnectConfig,
} from "@/lib/vm-ssh-config"

type SessionRecord = {
  client: Client
  channel: ClientChannel
  onChannelData: (chunk: Buffer) => void
  onChannelErrorData: (chunk: Buffer) => void
  listeners: Map<string, (chunk: Buffer) => void>
  createdAt: number
}

type ClosureRecord = { reason: string; closedAt: number }

declare global {
  // eslint-disable-next-line no-var
  var __powerbaseVmSshSessions: Map<string, SessionRecord> | undefined
  // eslint-disable-next-line no-var
  var __powerbaseVmSshRecentClosures: Map<string, ClosureRecord> | undefined
}

const sessions = globalThis.__powerbaseVmSshSessions ?? new Map<string, SessionRecord>()
const recentClosures =
  globalThis.__powerbaseVmSshRecentClosures ?? new Map<string, ClosureRecord>()

globalThis.__powerbaseVmSshSessions = sessions
globalThis.__powerbaseVmSshRecentClosures = recentClosures

const RECENT_CLOSURE_TTL_MS = 30_000

function rememberClosure(id: string, reason: string) {
  recentClosures.set(id, { reason, closedAt: Date.now() })
}

function getRecentClosureReason(id: string): string | null {
  const rec = recentClosures.get(id)
  if (!rec) return null
  if (Date.now() - rec.closedAt > RECENT_CLOSURE_TTL_MS) {
    recentClosures.delete(id)
    return null
  }
  return rec.reason
}

function broadcast(record: SessionRecord, chunk: Buffer) {
  for (const fn of record.listeners.values()) {
    fn(chunk)
  }
}

export function getSshSession(id: string): SessionRecord | undefined {
  return sessions.get(id)
}

export function closeSshSession(id: string): void {
  const rec = sessions.get(id)
  if (!rec) return
  rec.channel.off("data", rec.onChannelData)
  rec.channel.stderr.off("data", rec.onChannelErrorData)
  try {
    rec.channel.end()
  } catch {
    /* ignore */
  }
  try {
    rec.client.end()
  } catch {
    /* ignore */
  }
  sessions.delete(id)
}

export function addSessionListener(
  sessionId: string,
  listenerId: string,
  fn: (chunk: Buffer) => void
): { ok: true } | { ok: false; error: string } {
  const rec = sessions.get(sessionId)
  if (!rec) {
    return { ok: false, error: getRecentClosureReason(sessionId) ?? "Unknown or expired session" }
  }
  rec.listeners.set(listenerId, fn)
  return { ok: true }
}

export function removeSessionListener(sessionId: string, listenerId: string): void {
  const rec = sessions.get(sessionId)
  if (!rec) return
  rec.listeners.delete(listenerId)
}

function resolveConnectConfig(
  manual?: { host: string; port: number; username: string; password: string }
): { ok: true; connect: ConnectConfig } | { ok: false; error: string } {
  if (manual) {
    return buildConnectFromFormCredentials(manual)
  }
  const env = getVmSshConnectConfig()
  if (!env.ok) {
    return { ok: false, error: env.reason }
  }
  return { ok: true, connect: env.connect }
}

export async function createSshShellSession(
  manual?: { host: string; port: number; username: string; password: string }
): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  const cfg = resolveConnectConfig(manual)
  if (!cfg.ok) {
    return { ok: false, error: cfg.error }
  }

  const client = new Client()

  return await new Promise((resolve) => {
    const fail = (err: Error | string) => {
      try {
        client.end()
      } catch {
        /* ignore */
      }
      resolve({ ok: false, error: typeof err === "string" ? err : err.message })
    }

    client.once("error", (err) => fail(err))

    client.once("ready", () => {
      const wnd = { cols: 120, rows: 36, width: 120 * 9, height: 36 * 16, term: "xterm-256color" }
      client.shell(wnd, (err, channel) => {
        if (err || !channel) {
          try {
            client.end()
          } catch {
            /* ignore */
          }
          fail(err ?? new Error("No channel"))
          return
        }

        const sessionId = crypto.randomUUID()
        let closed = false
        const record: SessionRecord = {
          client,
          channel,
          listeners: new Map(),
          createdAt: Date.now(),
          onChannelData: (chunk: Buffer) => {
            broadcast(record, chunk)
          },
          onChannelErrorData: (chunk: Buffer) => {
            broadcast(record, chunk)
          },
        }

        channel.on("data", record.onChannelData)
        channel.stderr.on("data", record.onChannelErrorData)

        const closeWithNotice = (message?: string) => {
          if (closed) return
          closed = true
          rememberClosure(
            sessionId,
            message ? message.replace(/\x1b\[[0-9;]*m/g, "") : "SSH session closed."
          )
          if (message) {
            broadcast(record, Buffer.from(`\r\n${message}\r\n`, "utf8"))
          }
          closeSshSession(sessionId)
        }

        channel.on("close", () => {
          closeWithNotice("\x1b[33mSSH session closed.\x1b[0m")
        })

        client.on("close", () => {
          closeWithNotice("\x1b[33mSSH connection closed.\x1b[0m")
        })

        client.on("error", (err) => {
          closeWithNotice(`\x1b[31mSSH error: ${err.message}\x1b[0m`)
        })

        sessions.set(sessionId, record)
        resolve({ ok: true, sessionId })
      })
    })

    try {
      client.connect(cfg.connect)
    } catch (e) {
      fail(e instanceof Error ? e : new Error(String(e)))
    }
  })
}

export function writeStdin(sessionId: string, data: string): { ok: true } | { ok: false; error: string } {
  const rec = sessions.get(sessionId)
  if (!rec) {
    return { ok: false, error: getRecentClosureReason(sessionId) ?? "Unknown or expired session" }
  }
  try {
    rec.channel.write(Buffer.from(data, "utf8"))
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export function resizePty(
  sessionId: string,
  cols: number,
  rows: number
): { ok: true } | { ok: false; error: string } {
  const rec = sessions.get(sessionId)
  if (!rec) {
    return { ok: false, error: getRecentClosureReason(sessionId) ?? "Unknown or expired session" }
  }
  if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols < 1 || rows < 1 || cols > 500 || rows > 200) {
    return { ok: false, error: "Invalid terminal size" }
  }
  try {
    const width = Math.max(0, Math.floor(cols * 9))
    const height = Math.max(0, Math.floor(rows * 16))
    rec.channel.setWindow(rows, cols, height, width)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Best-effort sweep of stale sessions (e.g. client closed browser). */
const MAX_AGE_MS = 3 * 60 * 60 * 1000
setInterval(() => {
  const now = Date.now()
  for (const [id, rec] of sessions.entries()) {
    if (now - rec.createdAt > MAX_AGE_MS) {
      closeSshSession(id)
    }
  }
}, 5 * 60 * 1000).unref?.()
