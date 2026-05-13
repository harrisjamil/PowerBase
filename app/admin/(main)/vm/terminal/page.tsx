"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import "@xterm/xterm/css/xterm.css"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Server, Terminal as TerminalIcon, Unplug, Plug } from "lucide-react"
import { toast } from "sonner"

type UiConfig =
  | "loading"
  | { ok: true; defaults: { host: string; port: number; username: string }; envAuthReady: boolean }
  | { ok: false; error: string }

type JsonResult = { ok: true } | { ok: false; error: string }

function b64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i)
  }
  return out
}

async function postJson(url: string, body: Record<string, unknown>): Promise<JsonResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      return { ok: true }
    }
    const j = (await res.json().catch(() => null)) as { error?: unknown } | null
    const error = typeof j?.error === "string" ? j.error : `HTTP ${res.status}`
    return { ok: false, error }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Network error" }
  }
}

export default function VmTerminalPage() {
  const [connectOpen, setConnectOpen] = useState(false)
  const [uiConfig, setUiConfig] = useState<UiConfig>("loading")
  const [host, setHost] = useState("")
  const [port, setPort] = useState("22")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  useEffect(() => {
    const onPageHide = () => {
      const id = sessionIdRef.current
      if (!id) return
      void fetch(`/api/vm-ssh/session?sessionId=${encodeURIComponent(id)}`, {
        method: "DELETE",
        keepalive: true,
      })
    }
    window.addEventListener("pagehide", onPageHide)
    return () => window.removeEventListener("pagehide", onPageHide)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/vm-ssh/config")
        const j = (await res.json()) as {
          ok?: boolean
          defaults?: { host: string; port: number; username: string }
          envAuthReady?: boolean
          error?: string
        }
        if (cancelled) return
        if (!res.ok) {
          setUiConfig({ ok: false, error: `HTTP ${res.status}` })
          return
        }
        if (j.ok && j.defaults) {
          setUiConfig({
            ok: true,
            defaults: j.defaults,
            envAuthReady: Boolean(j.envAuthReady),
          })
          setHost(j.defaults.host)
          setPort(String(j.defaults.port))
          setUsername(j.defaults.username)
        } else {
          setUiConfig({
            ok: false,
            error: typeof j.error === "string" ? j.error : "Failed to load",
          })
        }
      } catch {
        if (!cancelled) setUiConfig({ ok: false, error: "Failed to load SSH defaults" })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const postSession = useCallback(
    async (body: Record<string, unknown> | null) => {
      setConnecting(true)
      try {
        const res = await fetch("/api/vm-ssh/session", {
          method: "POST",
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        })
        const j = (await res.json()) as { ok?: boolean; sessionId?: string; error?: string }
        if (!res.ok || !j.ok || !j.sessionId) {
          toast.error(j.error ?? "Could not open SSH session")
          return false
        }
        sessionIdRef.current = j.sessionId
        setSessionId(j.sessionId)
        toast.success("Connected")
        return true
      } catch {
        toast.error("Could not open SSH session")
        return false
      } finally {
        setConnecting(false)
      }
    },
    []
  )

  const connectWithForm = async () => {
    const p = parseInt(port, 10)
    const ok = await postSession({
      host: host.trim(),
      port: Number.isFinite(p) ? p : 22,
      username: username.trim(),
      password,
    })
    if (ok) setConnectOpen(false)
  }

  const connectWithEnv = async () => {
    const ok = await postSession(null)
    if (ok) setConnectOpen(false)
  }

  useEffect(() => {
    if (!sessionId || !containerRef.current) return

    const sid = sessionId
    const el = containerRef.current
    let disposed = false
    let ended = false
    let streamOpen = false
    let waitingForReconnect = false
    let inputClosed = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let inputFlushTimer: ReturnType<typeof setTimeout> | null = null
    let inputQueue = Promise.resolve()
    let pendingInput = ""
    let lastResizeError = ""

    const term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontSize: 14,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      scrollback: 5000,
      theme: {
        background: "#09090b",
        foreground: "#fafafa",
        cursor: "#fafafa",
        black: "#09090b",
        brightBlack: "#27272a",
        red: "#f87171",
        brightRed: "#fca5a5",
        green: "#4ade80",
        brightGreen: "#86efac",
        yellow: "#facc15",
        brightYellow: "#fde047",
        blue: "#60a5fa",
        brightBlue: "#93c5fd",
        magenta: "#e879f9",
        brightMagenta: "#f0abfc",
        cyan: "#22d3ee",
        brightCyan: "#67e8f9",
        white: "#e4e4e7",
        brightWhite: "#fafafa",
      },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    fit.fit()
    term.focus()

    const writeStatus = (message: string, color: 31 | 32 | 33 = 33) => {
      if (disposed) return
      term.writeln(`\r\n\x1b[${color}m${message}\x1b[0m`)
    }

    const clearReconnectTimer = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
    }

    const clearInputFlushTimer = () => {
      if (inputFlushTimer) {
        clearTimeout(inputFlushTimer)
        inputFlushTimer = null
      }
    }

    const endSessionUi = ({
      message,
      color = 31,
      deleteRemote = true,
    }: {
      message?: string
      color?: 31 | 32 | 33
      deleteRemote?: boolean
    } = {}) => {
      if (ended) return
      ended = true
      inputClosed = true
      waitingForReconnect = false
      clearReconnectTimer()
      if (message) {
        writeStatus(message, color)
      }
      if (sessionIdRef.current === sid) {
        sessionIdRef.current = null
      }
      if (!disposed) {
        setSessionId((cur) => (cur === sid ? null : cur))
      }
      if (deleteRemote) {
        void fetch(`/api/vm-ssh/session?sessionId=${encodeURIComponent(sid)}`, { method: "DELETE" })
      }
    }

    const postResize = async () => {
      const dims = fit.proposeDimensions()
      if (
        !dims ||
        !Number.isFinite(dims.cols) ||
        !Number.isFinite(dims.rows) ||
        dims.cols < 1 ||
        dims.rows < 1
      ) {
        return
      }
      const r = await postJson("/api/vm-ssh/resize", {
        sessionId: sid,
        cols: dims.cols,
        rows: dims.rows,
      })
      if (disposed || ended || r.ok) return
      if (r.error === "Unknown or expired session") {
        endSessionUi({ message: "SSH session closed.", deleteRemote: false })
        return
      }
      if (r.error !== lastResizeError) {
        lastResizeError = r.error
        writeStatus(`Resize failed: ${r.error}`, 33)
      }
    }

    const ro = new ResizeObserver(() => {
      fit.fit()
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
      resizeTimerRef.current = setTimeout(() => postResize(), 120)
    })
    ro.observe(el)
    void postResize()

    const es = new EventSource(`/api/vm-ssh/stream?sessionId=${encodeURIComponent(sid)}`)

    es.onopen = () => {
      streamOpen = true
      if (!waitingForReconnect) {
        return
      }
      waitingForReconnect = false
      clearReconnectTimer()
      writeStatus("Terminal stream reconnected.", 32)
    }

    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as { b64?: string; error?: string; closed?: boolean }
        if (msg.error) {
          endSessionUi({ message: msg.error, deleteRemote: false })
          return
        }
        if (msg.closed) {
          endSessionUi({ message: "Session closed.", color: 33, deleteRemote: false })
          return
        }
        if (msg.b64) {
          term.write(b64ToUint8Array(msg.b64))
        }
      } catch {
        /* ignore */
      }
    }

    es.onerror = () => {
      if (disposed || ended || waitingForReconnect) return
      waitingForReconnect = true
      writeStatus(
        streamOpen ? "Terminal stream interrupted. Reconnecting..." : "Connecting terminal stream..."
      )
      reconnectTimer = setTimeout(() => {
        if (disposed || ended) return
        waitingForReconnect = false
        endSessionUi({
          message: streamOpen
            ? "Connection to terminal stream was lost."
            : "Could not attach to the terminal stream.",
          deleteRemote: false,
        })
      }, 5000)
    }

    const flushPendingInput = (force = false) => {
      if (sessionIdRef.current !== sid || inputClosed) return
      if (!pendingInput) return
      if (!force) {
        clearInputFlushTimer()
      }
      const data = pendingInput
      pendingInput = ""
      inputQueue = inputQueue
        .then(async () => {
          if (disposed || ended || sessionIdRef.current !== sid || inputClosed) return
          const r = await postJson("/api/vm-ssh/stdin", { sessionId: sid, data })
          if (disposed || ended || r.ok) return
          inputClosed = true
          const message =
            r.error === "Unknown or expired session" ? "SSH session closed." : `Input failed: ${r.error}`
          toast.error(message)
          endSessionUi({
            message,
            deleteRemote: false,
          })
        })
        .catch(() => {
          /* keep queue alive */
        })
    }

    term.onData((data) => {
      if (sessionIdRef.current !== sid || inputClosed) return
      pendingInput += data
      if (/[\r\n\u0003\u0004]/.test(data)) {
        flushPendingInput(true)
        return
      }
      clearInputFlushTimer()
      inputFlushTimer = setTimeout(() => {
        flushPendingInput(true)
      }, 16)
    })

    return () => {
      disposed = true
      inputClosed = true
      clearReconnectTimer()
      clearInputFlushTimer()
      ro.disconnect()
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
      es.onopen = null
      es.onmessage = null
      es.onerror = null
      es.close()
      term.dispose()
    }
  }, [sessionId])

  const disconnect = () => {
    const id = sessionIdRef.current
    sessionIdRef.current = null
    if (id) {
      void fetch(`/api/vm-ssh/session?sessionId=${encodeURIComponent(id)}`, { method: "DELETE" })
    }
    setSessionId(null)
    setPassword("")
    toast.message("Disconnected")
  }

  const formReady = uiConfig !== "loading" && uiConfig.ok
  const canSubmitForm =
    formReady && host.trim().length > 0 && username.trim().length > 0 && password.length > 0

  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <TerminalIcon className="h-5 w-5" />
            VM terminal (SSH)
          </h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Click <strong className="font-medium text-foreground">Connect</strong> to open the
            SSH login dialog. Host and user are pre-filled from{" "}
            <code className="rounded bg-muted px-1 text-xs">VM_IP</code>,{" "}
            <code className="rounded bg-muted px-1 text-xs">VM_SSH_HOST</code>, and{" "}
            <code className="rounded bg-muted px-1 text-xs">VM_SSH_USER</code> when configured.
          </p>
        </div>
        {sessionId ? (
          <Button variant="outline" className="gap-2 shrink-0" onClick={disconnect} type="button">
            <Unplug className="h-4 w-4" />
            Disconnect
          </Button>
        ) : formReady ? (
          <Button
            type="button"
            className="gap-2 shrink-0"
            onClick={() => setConnectOpen(true)}
            disabled={uiConfig === "loading"}
          >
            <Plug className="h-4 w-4" />
            Connect
          </Button>
        ) : null}
      </div>

      {uiConfig === "loading" && (
        <div className="text-sm text-muted-foreground">Loading connection defaults…</div>
      )}

      {uiConfig !== "loading" && !uiConfig.ok && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm text-amber-950 dark:text-amber-100 whitespace-pre-wrap">
          {uiConfig.error}
        </div>
      )}

      {formReady && !uiConfig.envAuthReady && host.trim().length === 0 && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 px-4 py-3 text-sm text-blue-950 dark:text-blue-100">
          No SSH host is configured in <code className="rounded bg-muted px-1 text-xs">.env</code>.
          Enter your VM IP/host manually, or set <code className="rounded bg-muted px-1 text-xs">VM_SSH_HOST</code>{" "}
          and <code className="rounded bg-muted px-1 text-xs">VM_SSH_USER</code>.
        </div>
      )}

      <Dialog
        open={connectOpen}
        onOpenChange={(open) => {
          if (!open && connecting) return
          setConnectOpen(open)
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Server className="h-4 w-4" />
              SSH login
            </DialogTitle>
            <DialogDescription>
              Enter the VM SSH host, username, and password. Values are pre-filled only when
              <code className="rounded bg-muted px-1 text-xs"> VM_SSH_HOST</code> /{" "}
              <code className="rounded bg-muted px-1 text-xs">VM_IP</code> and{" "}
              <code className="rounded bg-muted px-1 text-xs">VM_SSH_USER</code> are configured.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid gap-2">
              <Label htmlFor="ssh-host">Host or IP</Label>
              <Input
                id="ssh-host"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="e.g. 13.218.183.33"
                autoComplete="off"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ssh-port">Port</Label>
              <Input
                id="ssh-port"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="22"
                inputMode="numeric"
                autoComplete="off"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ssh-user">Username</Label>
              <Input
                id="ssh-user"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. ubuntu"
                autoComplete="username"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ssh-pass">Password</Label>
              <Input
                id="ssh-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="SSH password"
                autoComplete="current-password"
              />
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <div className="flex flex-wrap gap-2 w-full">
              <Button
                type="button"
                className="gap-2 flex-1 sm:flex-none"
                disabled={connecting || !canSubmitForm}
                onClick={() => void connectWithForm()}
              >
                <Plug className="h-4 w-4" />
                {connecting ? "Connecting…" : "Connect"}
              </Button>
              {uiConfig !== "loading" && uiConfig.ok && uiConfig.envAuthReady ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1 sm:flex-none"
                  disabled={connecting}
                  onClick={() => void connectWithEnv()}
                >
                  {connecting ? "Connecting…" : "Use .env only"}
                </Button>
              ) : null}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div
        ref={containerRef}
        className={`min-h-[420px] w-full rounded-lg border border-zinc-800 overflow-hidden bg-zinc-950 p-1 ${
          sessionId ? "" : "opacity-40 pointer-events-none"
        }`}
      />

      <p className="text-xs text-muted-foreground max-w-3xl">
        Credentials are sent to this app over HTTPS and used only to open an SSH session from the
        server to your VM. Prefer key-based auth via server{" "}
        <code className="rounded bg-muted px-1">VM_SSH_PRIVATE_KEY_PATH</code> and “Use .env only”
        in the connect dialog when configured.
      </p>
    </div>
  )
}
