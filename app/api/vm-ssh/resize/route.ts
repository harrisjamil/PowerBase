import { NextResponse } from "next/server"
import { requireAdminRequest } from "@/lib/auth/session"
import { resizePty } from "@/lib/vm-ssh-sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 })
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 })
  }
  const o = body as Record<string, unknown>
  const sessionId = typeof o.sessionId === "string" ? o.sessionId : ""
  const cols = typeof o.cols === "number" ? o.cols : Number(o.cols)
  const rows = typeof o.rows === "number" ? o.rows : Number(o.rows)
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "sessionId required" }, { status: 400 })
  }
  const r = resizePty(sessionId, cols, rows)
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.error }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
