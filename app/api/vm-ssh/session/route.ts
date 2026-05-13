import { NextResponse } from "next/server"
import { requireAdminRequest } from "@/lib/auth/session"
import { closeSshSession, createSshShellSession } from "@/lib/vm-ssh-sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ManualBody = {
  host?: unknown
  port?: unknown
  username?: unknown
  password?: unknown
}

export async function POST(request: Request) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  let body: ManualBody | null = null
  try {
    const text = await request.text()
    if (text.trim()) {
      body = JSON.parse(text) as ManualBody
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }

  if (
    body &&
    typeof body.host === "string" &&
    body.host.trim().length > 0 &&
    typeof body.username === "string" &&
    body.username.trim().length > 0 &&
    typeof body.password === "string"
  ) {
    const host = body.host.trim()
    const port =
      typeof body.port === "number" && Number.isFinite(body.port)
        ? body.port
        : parseInt(String(body.port ?? "22"), 10)
    const username = typeof body.username === "string" ? body.username.trim() : ""
    const password = typeof body.password === "string" ? body.password : ""
    const result = await createSshShellSession({ host, port, username, password })
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
    }
    return NextResponse.json({ ok: true, sessionId: result.sessionId })
  }

  const result = await createSshShellSession()
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
  }
  return NextResponse.json({ ok: true, sessionId: result.sessionId })
}

export async function DELETE(request: Request) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get("sessionId")
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "sessionId required" }, { status: 400 })
  }
  closeSshSession(sessionId)
  return NextResponse.json({ ok: true })
}
