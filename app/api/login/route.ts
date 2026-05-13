import { NextResponse } from "next/server"
import { createAdminSession, setAdminSessionCookie } from "@/lib/auth/session"
import { hashPassword, needsPasswordUpgrade, verifyPassword } from "@/lib/auth/passwords"
import { getControlSchema, getQuotedControlTableRef } from "@/lib/control-schema"
import { getPool } from "@/lib/db"

export async function POST(req: Request) {
  const client = await getPool().connect()
  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const { email, password } = body as { email?: unknown; password?: unknown }
    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 })
    }

    const result = await client.query<{ id: number; email: string; password: string }>(
      `
      SELECT id, email, password
      FROM ${getQuotedControlTableRef()}
      WHERE email = $1
      LIMIT 1
      `,
      [email.trim()]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      )
    }

    const user = result.rows[0]
    if (!verifyPassword(password, user.password)) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      )
    }

    if (needsPasswordUpgrade(user.password)) {
      await client.query(
        `
          UPDATE ${getQuotedControlTableRef()}
          SET password = $1
          WHERE id = $2
        `,
        [hashPassword(password), user.id]
      )
    }

    const response = NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email, controlSchema: getControlSchema() },
    })
    return setAdminSessionCookie(
      response,
      createAdminSession({
        id: user.id,
        email: user.email,
        controlSchema: getControlSchema(),
      })
    )

  } catch (error) {
    console.error("LOGIN ERROR:", error)

    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}