import { NextResponse } from "next/server"
import { getControlSchema } from "@/lib/control-schema"
import { getPool } from "@/lib/db"
import {
  authenticatePostgresRole,
  getPostgresRoleByName,
} from "@/lib/postgres-roles"
import {
  createDbUserSession,
  setDbUserSessionCookie,
} from "@/lib/auth/db-user-session"
import { readDbUsername } from "@/lib/db-users"
import { pgUserHasAnyProjectAccess } from "@/lib/teams"
import { enforceLoginRateLimit } from "@/lib/security/login-rate-limit"

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const username = readDbUsername(
    body && typeof body === "object" ? (body as { username?: unknown }).username : undefined
  )
  const rawPassword =
    body && typeof body === "object" ? (body as { password?: unknown }).password : undefined
  const password = typeof rawPassword === "string" ? rawPassword : null

  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password are required" },
      { status: 400 }
    )
  }

  const rateLimited = enforceLoginRateLimit(req, username)
  if (rateLimited) {
    return rateLimited
  }

  const isValid = await authenticatePostgresRole(username, password)
  if (!isValid) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
  }

  const client = await getPool().connect()
  try {
    const dbUser = await getPostgresRoleByName(client, username)
    if (!dbUser) {
      return NextResponse.json(
        { error: "PostgreSQL role not found" },
        { status: 404 }
      )
    }
    const hasProjectAccess = await pgUserHasAnyProjectAccess(client, username)
    if (!hasProjectAccess) {
      return NextResponse.json(
        {
          error:
            "This PostgreSQL user is not assigned to any project in PowerBase (directly or via a team)",
        },
        { status: 403 }
      )
    }

    const response = NextResponse.json({
      success: true,
      user: {
        id: dbUser.oid,
        username: dbUser.username,
        controlSchema: getControlSchema(),
      },
    })

    return setDbUserSessionCookie(
      response,
      createDbUserSession({
        id: dbUser.oid,
        username: dbUser.username,
        controlSchema: getControlSchema(),
      })
    )
  } catch (error) {
    console.error("DB USER LOGIN ERROR:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  } finally {
    client.release()
  }
}
