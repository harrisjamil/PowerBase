import type { PoolClient } from "pg"
import { NextRequest, NextResponse } from "next/server"
import { hashPassword } from "@/lib/auth/passwords"
import { requireAdminRequest } from "@/lib/auth/session"
import { AgentRecord, ensureAgentsTable, readAgentEmail } from "@/lib/agents"
import { getPool } from "@/lib/db"
import { getQuotedAgentsTableRef } from "@/lib/control-schema"

type AgentBody = {
  id?: unknown
  email?: unknown
  password?: unknown
}

function readId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value)
  return null
}

function readPassword(value: unknown): string | null {
  if (typeof value !== "string") return null
  if (!value || value.length > 512) return null
  return value
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

async function emailBelongsToAnotherAgent(
  client: PoolClient,
  email: string,
  excludeId?: number
) {
  const result = await client.query<{ id: number }>(
    `
      SELECT id
      FROM ${getQuotedAgentsTableRef()}
      WHERE lower(email) = lower($1)
        ${excludeId ? "AND id <> $2" : ""}
      LIMIT 1
    `,
    excludeId ? [email, excludeId] : [email]
  )
  return result.rowCount > 0
}

export async function GET(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  const client = await getPool().connect()
  try {
    await ensureAgentsTable(client)
    const result = await client.query<AgentRecord>(`
      SELECT id, email, created_at::text, password IS NOT NULL AS has_password
      FROM ${getQuotedAgentsTableRef()}
      ORDER BY id
    `)

    return NextResponse.json({
      success: true,
      agents: result.rows,
      count: result.rows.length,
    })
  } catch (error) {
    console.error("Error fetching agents:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to fetch agents") },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  let body: AgentBody
  try {
    body = (await request.json()) as AgentBody
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    )
  }

  const email = readAgentEmail(body.email)
  const password = readPassword(body.password)

  if (!email || !password) {
    return NextResponse.json(
      { success: false, error: "Email and password are required" },
      { status: 400 }
    )
  }

  const client = await getPool().connect()
  try {
    await ensureAgentsTable(client)
    if (await emailBelongsToAnotherAgent(client, email)) {
      return NextResponse.json(
        { success: false, error: "An agent with this email already exists" },
        { status: 409 }
      )
    }
    const result = await client.query<AgentRecord>(
      `
        INSERT INTO ${getQuotedAgentsTableRef()} (email, password, created_at)
        VALUES ($1, $2, now())
        RETURNING id, email, created_at::text, password IS NOT NULL AS has_password
      `,
      [email, hashPassword(password)]
    )

    return NextResponse.json({
      success: true,
      agent: result.rows[0],
      message: `Agent ${email} created successfully`,
    })
  } catch (error) {
    console.error("Error creating agent:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to create agent") },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}

export async function PUT(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  let body: AgentBody
  try {
    body = (await request.json()) as AgentBody
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    )
  }

  const id = readId(body.id)
  const email = readAgentEmail(body.email)
  const password =
    body.password === undefined || body.password === "" ? null : readPassword(body.password)

  if (!id || !email) {
    return NextResponse.json(
      { success: false, error: "ID and email are required" },
      { status: 400 }
    )
  }
  if (body.password !== undefined && body.password !== "" && !password) {
    return NextResponse.json(
      { success: false, error: "Password is invalid" },
      { status: 400 }
    )
  }

  const assignments = ["email = $2"]
  const values: Array<number | string | null> = [id, email]
  const nextIndex = 3

  if (password !== null) {
    assignments.push(`password = $${nextIndex}`)
    values.push(hashPassword(password))
  }

  const client = await getPool().connect()
  try {
    await ensureAgentsTable(client)
    if (await emailBelongsToAnotherAgent(client, email, id)) {
      return NextResponse.json(
        { success: false, error: "An agent with this email already exists" },
        { status: 409 }
      )
    }
    const result = await client.query<AgentRecord>(
      `
        UPDATE ${getQuotedAgentsTableRef()}
        SET ${assignments.join(", ")}
        WHERE id = $1
        RETURNING id, email, created_at::text, password IS NOT NULL AS has_password
      `,
      values
    )

    if (result.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: "Agent not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      agent: result.rows[0],
      message: `Agent ${email} updated successfully`,
    })
  } catch (error) {
    console.error("Error updating agent:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to update agent") },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}

export async function DELETE(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const id = readId(searchParams.get("id"))
  if (!id) {
    return NextResponse.json(
      { success: false, error: "ID is required" },
      { status: 400 }
    )
  }

  const client = await getPool().connect()
  try {
    await ensureAgentsTable(client)
    const result = await client.query<{ id: number; email: string }>(
      `
        DELETE FROM ${getQuotedAgentsTableRef()}
        WHERE id = $1
        RETURNING id, email
      `,
      [id]
    )

    if (result.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: "Agent not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Agent ${result.rows[0].email} deleted successfully`,
    })
  } catch (error) {
    console.error("Error deleting agent:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to delete agent") },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
