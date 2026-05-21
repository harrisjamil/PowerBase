import { NextRequest, NextResponse } from "next/server"
import { requireAdminRequest } from "@/lib/auth/session"
import { getPrincipalSessionFromRequest } from "@/lib/auth/principal-session"
import { getPool } from "@/lib/db"
import { buildAdminDashboard } from "@/lib/admin-dashboard"

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export async function GET(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  const principal = getPrincipalSessionFromRequest(request)
  if (!principal) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const client = await getPool().connect()
  try {
    const dashboard = await buildAdminDashboard(client, principal)
    return NextResponse.json({
      success: true,
      dashboard,
      adminEmail: auth.session.email,
    })
  } catch (error) {
    console.error("Admin dashboard error:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to load dashboard") },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
