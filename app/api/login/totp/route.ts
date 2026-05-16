import { NextResponse } from "next/server"
import { verifyAdminTotpCode } from "@/lib/admin-totp"
import { verifyLoginChallenge } from "@/lib/auth/login-challenge"
import { createAdminSession, setAdminSessionCookie } from "@/lib/auth/session"
import { getControlSchema } from "@/lib/control-schema"
import { getPool } from "@/lib/db"
import { getPostgresRoleByOid } from "@/lib/postgres-roles"

function readCode(value: unknown): string | null {
  if (typeof value !== "string") return null
  const code = value.replace(/\s/g, "")
  if (!/^\d{6}$/.test(code)) return null
  return code
}

export async function POST(req: Request) {
  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const loginChallenge =
      body && typeof body === "object" && typeof (body as { loginChallenge?: unknown }).loginChallenge === "string"
        ? (body as { loginChallenge: string }).loginChallenge
        : null
    const code =
      body && typeof body === "object" ? readCode((body as { code?: unknown }).code) : null

    if (!loginChallenge || !code) {
      return NextResponse.json(
        { error: "Login challenge and 6-digit authenticator code are required" },
        { status: 400 }
      )
    }

    const challenge = verifyLoginChallenge(loginChallenge)
    if (!challenge) {
      return NextResponse.json(
        { error: "Login session expired. Please sign in again." },
        { status: 401 }
      )
    }

    const client = await getPool().connect()
    try {
      const isValid = await verifyAdminTotpCode(client, challenge.roleOid, code)
      if (!isValid) {
        return NextResponse.json(
          { error: "Invalid authenticator code" },
          { status: 401 }
        )
      }

      const role = await getPostgresRoleByOid(client, challenge.roleOid)
      if (!role || role.username !== challenge.username) {
        return NextResponse.json(
          { error: "Account not found" },
          { status: 404 }
        )
      }

      const response = NextResponse.json({
        success: true,
        user: { id: role.oid, email: role.username, controlSchema: getControlSchema() },
      })
      return setAdminSessionCookie(
        response,
        createAdminSession({
          id: role.oid,
          email: role.username,
          controlSchema: getControlSchema(),
        })
      )
    } finally {
      client.release()
    }
  } catch (error) {
    console.error("LOGIN TOTP ERROR:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
