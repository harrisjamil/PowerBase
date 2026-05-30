import { NextResponse } from "next/server"
import { createAgentSession, setAgentSessionCookie } from "@/lib/auth/agent-session"
import { needsPasswordUpgrade, verifyPassword, hashPassword } from "@/lib/auth/passwords"
import { ensureAgentsTable, readAgentEmail } from "@/lib/agents"
import { getQuotedAgentsTableRef, getControlSchema } from "@/lib/control-schema"
import { getPool } from "@/lib/db"
import { enforceLoginRateLimit } from "@/lib/security/login-rate-limit"

export async function POST(req: Request) {
  const client = await getPool().connect()
  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const rawPassword =
      body && typeof body === "object" ? (body as { password?: unknown }).password : undefined
    const email = readAgentEmail(
      body && typeof body === "object" ? (body as { email?: unknown }).email : undefined
    )
    const password = typeof rawPassword === "string" ? rawPassword : null

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 })
    }

    const rateLimited = enforceLoginRateLimit(req, email)
    if (rateLimited) {
      return rateLimited
    }

    await ensureAgentsTable(client)
    const result = await client.query<{
      id: number
      email: string
      password: string
    }>(
      `
        SELECT id, email, password
        FROM ${getQuotedAgentsTableRef()}
        WHERE email = $1
        LIMIT 1
      `,
      [email]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
    }

    const agent = result.rows[0]
    if (!verifyPassword(password, agent.password)) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
    }

    if (needsPasswordUpgrade(agent.password)) {
      await client.query(
        `
          UPDATE ${getQuotedAgentsTableRef()}
          SET password = $1
          WHERE id = $2
        `,
        [hashPassword(password), agent.id]
      )
    }

    const response = NextResponse.json({
      success: true,
      user: {
        id: agent.id,
        email: agent.email,
        controlSchema: getControlSchema(),
      },
    })

    return setAgentSessionCookie(
      response,
      createAgentSession({
        id: agent.id,
        email: agent.email,
        controlSchema: getControlSchema(),
      })
    )
  } catch (error) {
    console.error("AGENT LOGIN ERROR:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  } finally {
    client.release()
  }
}
