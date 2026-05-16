import { NextResponse } from "next/server"
import { confirmAdminTotpEnrollment } from "@/lib/admin-totp"
import { requireAdminRequest } from "@/lib/auth/session"
import { getPool } from "@/lib/db"

function readCode(value: unknown): string | null {
  if (typeof value !== "string") return null
  const code = value.replace(/\s/g, "")
  if (!/^\d{6}$/.test(code)) return null
  return code
}

export async function POST(request: Request) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const enrollmentId =
    typeof body.enrollmentId === "string" ? body.enrollmentId.trim() : ""
  const code = readCode(body.code)

  if (!enrollmentId || !code) {
    return NextResponse.json(
      { success: false, error: "Enrollment ID and 6-digit code are required." },
      { status: 400 }
    )
  }

  const client = await getPool().connect()
  try {
    const result = await confirmAdminTotpEnrollment(
      client,
      enrollmentId,
      code,
      auth.session.id
    )
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error confirming TOTP enrollment:", error)
    return NextResponse.json(
      { success: false, error: "Failed to confirm authenticator setup" },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
