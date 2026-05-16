import { NextResponse } from "next/server"
import { isAdminTotpEnrolled } from "@/lib/admin-totp"
import { createLoginChallenge } from "@/lib/auth/login-challenge"
import { createAdminSession, setAdminSessionCookie } from "@/lib/auth/session"
import { getControlSchema } from "@/lib/control-schema"
import { getPool } from "@/lib/db"
import {
  authenticatePostgresRole,
  getPostgresRoleByName,
  readRoleName,
  roleCanAccessAdmin,
} from "@/lib/postgres-roles"

export async function POST(req: Request) {
  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const rawUsername =
      body && typeof body === "object"
        ? (body as { username?: unknown; email?: unknown }).username ??
          (body as { username?: unknown; email?: unknown }).email
        : undefined
    const username = readRoleName(rawUsername)
    const password =
      body && typeof body === "object" && typeof (body as { password?: unknown }).password === "string"
        ? (body as { password: string }).password
        : null

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 })
    }

    const isValid = await authenticatePostgresRole(username, password)
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      )
    }

    const client = await getPool().connect()
    try {
      const canAccess = await roleCanAccessAdmin(client, username)
      if (!canAccess) {
        return NextResponse.json(
          { error: "This PostgreSQL role is not allowed to access the admin area" },
          { status: 403 }
        )
      }

      const role = await getPostgresRoleByName(client, username)
      if (!role) {
        return NextResponse.json(
          { error: "PostgreSQL role not found" },
          { status: 404 }
        )
      }

      const totpEnrolled = await isAdminTotpEnrolled(client, role.oid)

      if (totpEnrolled) {
        return NextResponse.json({
          success: true,
          requiresTotp: true,
          loginChallenge: createLoginChallenge({
            roleOid: role.oid,
            username: role.username,
            controlSchema: getControlSchema(),
          }),
        })
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
    console.error("LOGIN ERROR:", error)

    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    )
  }
}