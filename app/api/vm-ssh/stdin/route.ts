import { NextResponse } from "next/server"
import { requireAdminRequest } from "@/lib/auth/session"
import { writeStdin } from "@/lib/vm-ssh-sessions"

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
  const data = typeof o.data === "string" ? o.data : ""
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "sessionId required" }, { status: 400 })
  }
  const r = writeStdin(sessionId, data)
  if (!r.ok) {
    console.warn("[vm-ssh/stdin]", sessionId, r.error)
    return NextResponse.json({ ok: false, error: r.error }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
