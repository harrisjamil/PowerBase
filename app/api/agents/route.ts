import type { PoolClient } from "pg"
import { NextRequest, NextResponse } from "next/server"
import { hashPassword } from "@/lib/auth/passwords"
import { requireAdminRequest } from "@/lib/auth/session"
import { AgentRecord, readAgentEmail } from "@/lib/agents"
import { getPool } from "@/lib/db"
import {
  dropIdentityDbRole,
  ensureIdentityAccessModel,
  getAgentDbRoleName,
  listSuperadminIdentities,
  syncAgentDbRole,
} from "@/lib/identity-db-access"
import { getAccessibleSchemaNames } from "@/lib/schema-access"
import {
  getControlSchema,
  getQuotedAgentsTableRef,
  getQuotedControlTableRef,
} from "@/lib/control-schema"

type AgentBody = {
  id?: unknown
  email?: unknown
  password?: unknown
  superadmin_id?: unknown
}

type AgentListRow = AgentRecord & {
  superadmin_id: number | null
  superadmin_email: string | null
}

type SuperadminOption = {
  id: number
  email: string
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

function readOptionalSuperadminId(value: unknown): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === "") return null
  return readId(value)
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
    await ensureIdentityAccessModel(client)
    const result = await client.query<AgentListRow>(`
      SELECT
        agents.id,
        agents.email,
        agents.created_at::text,
        NULLIF(agents.password, '') IS NOT NULL AS has_password,
        agents.superadmin_id,
        superadmins.email AS superadmin_email
      FROM ${getQuotedAgentsTableRef()} agents
      LEFT JOIN ${getQuotedControlTableRef()} superadmins
        ON superadmins.id = agents.superadmin_id
      ORDER BY agents.id
    `)
    const superadmins: SuperadminOption[] = await listSuperadminIdentities(client)

    const agents = []
    for (const agent of result.rows) {
      const accessibleSchemas =
        agent.superadmin_id === null
          ? []
          : Array.from(await getAccessibleSchemaNames(client, agent.superadmin_id)).filter(
              (schemaName) => schemaName !== getControlSchema()
            )

      agents.push({
        ...agent,
        db_role_name: getAgentDbRoleName(agent.id),
        accessible_schemas: accessibleSchemas,
      })
    }

    return NextResponse.json({
      success: true,
      agents,
      superadmins,
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
  const superadminId = readOptionalSuperadminId(body.superadmin_id)

  if (!email || !password) {
    return NextResponse.json(
      { success: false, error: "Email and password are required" },
      { status: 400 }
    )
  }
  if (body.superadmin_id !== undefined && superadminId === undefined) {
    return NextResponse.json(
      { success: false, error: "Superadmin assignment is invalid" },
      { status: 400 }
    )
  }

  const client = await getPool().connect()
  try {
    await ensureIdentityAccessModel(client)
    if (await emailBelongsToAnotherAgent(client, email)) {
      return NextResponse.json(
        { success: false, error: "An agent with this email already exists" },
        { status: 409 }
      )
    }
    if (superadminId !== undefined && superadminId !== null) {
      const superadmin = (await listSuperadminIdentities(client)).find((item) => item.id === superadminId)
      if (!superadmin) {
        return NextResponse.json(
          { success: false, error: "Selected superadmin was not found" },
          { status: 400 }
        )
      }
    }
    const result = await client.query<AgentListRow>(
      `
        INSERT INTO ${getQuotedAgentsTableRef()} (email, password, created_at, superadmin_id)
        VALUES ($1, $2, now(), $3)
        RETURNING
          id,
          email,
          created_at::text,
          NULLIF(password, '') IS NOT NULL AS has_password,
          superadmin_id,
          null::text AS superadmin_email
      `,
      [email, hashPassword(password), superadminId ?? null]
    )
    await syncAgentDbRole(client, result.rows[0].id, result.rows[0].superadmin_id)

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
  const superadminId = readOptionalSuperadminId(body.superadmin_id)

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
  if (body.superadmin_id !== undefined && superadminId === undefined) {
    return NextResponse.json(
      { success: false, error: "Superadmin assignment is invalid" },
      { status: 400 }
    )
  }

  const assignments = ["email = $2"]
  const values: Array<number | string | null> = [id, email]
  let nextIndex = 3

  if (password !== null) {
    assignments.push(`password = $${nextIndex}`)
    values.push(hashPassword(password))
    nextIndex += 1
  }
  if (superadminId !== undefined) {
    assignments.push(`superadmin_id = $${nextIndex}`)
    values.push(superadminId)
  }

  const client = await getPool().connect()
  try {
    await ensureIdentityAccessModel(client)
    if (await emailBelongsToAnotherAgent(client, email, id)) {
      return NextResponse.json(
        { success: false, error: "An agent with this email already exists" },
        { status: 409 }
      )
    }
    if (superadminId !== undefined && superadminId !== null) {
      const superadmin = (await listSuperadminIdentities(client)).find((item) => item.id === superadminId)
      if (!superadmin) {
        return NextResponse.json(
          { success: false, error: "Selected superadmin was not found" },
          { status: 400 }
        )
      }
    }
    const result = await client.query<AgentListRow>(
      `
        UPDATE ${getQuotedAgentsTableRef()}
        SET ${assignments.join(", ")}
        WHERE id = $1
        RETURNING
          id,
          email,
          created_at::text,
          NULLIF(password, '') IS NOT NULL AS has_password,
          superadmin_id,
          null::text AS superadmin_email
      `,
      values
    )

    if (result.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: "Agent not found" },
        { status: 404 }
      )
    }
    await syncAgentDbRole(client, result.rows[0].id, result.rows[0].superadmin_id)

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
    await ensureIdentityAccessModel(client)
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
    await dropIdentityDbRole(client, getAgentDbRoleName(result.rows[0].id))

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
