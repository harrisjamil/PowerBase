import { NextResponse } from "next/server"
import { startAdminTotpEnrollment } from "@/lib/admin-totp"
import { requireAdminRequest } from "@/lib/auth/session"
import { getPool } from "@/lib/db"

export async function POST(request: Request) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  const client = await getPool().connect()
  try {
    const enrollment = await startAdminTotpEnrollment(
      client,
      auth.session.id,
      auth.session.email
    )

    return NextResponse.json({
      success: true,
      ...enrollment,
    })
  } catch (error) {
    console.error("Error starting TOTP enrollment:", error)
    return NextResponse.json(
      { success: false, error: "Failed to start authenticator setup" },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
