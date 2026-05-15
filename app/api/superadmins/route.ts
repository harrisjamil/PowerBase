import type { PoolClient } from "pg"
import { NextRequest, NextResponse } from "next/server"
import { hashPassword } from "@/lib/auth/passwords"
import { requireAdminRequest } from "@/lib/auth/session"
import {
  CONTROL_TABLE_NAME,
  getControlSchema,
  getQuotedControlTableRef,
  isSafePgIdentifier,
} from "@/lib/control-schema"
import { getPool } from "@/lib/db"
import {
  dropIdentityDbRole,
  getSuperadminDbRoleName,
  syncAllIdentityDbRoles,
} from "@/lib/identity-db-access"
import {
  assignSchemaOwner,
  ensureSchemaAccessTable,
  getAccessibleSchemaNames,
  getQuotedSchemaAccessTableRef,
} from "@/lib/schema-access"

type SuperadminRow = {
  id: number
  email: string
  created_at: string | null
  test: string | null
  has_password: boolean
  assigned_schemas?: string[]
}

type SuperadminBody = {
  id?: unknown
  email?: unknown
  password?: unknown
  test?: unknown
  schema_names?: unknown
}

function readId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value)
  return null
}

function readEmail(value: unknown): string | null {
  if (typeof value !== "string") return null
  const email = value.trim()
  if (!email || email.length > 255) return null
  return email
}

function readPassword(value: unknown): string | null {
  if (typeof value !== "string") return null
  if (!value || value.length > 512) return null
  return value
}

function readOptionalText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, 1000)
}

function readSchemaNames(value: unknown): string[] | null | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return null

  const deduped = new Set<string>()
  for (const item of value) {
    if (typeof item !== "string") {
      return null
    }
    const schemaName = item.trim()
    if (
      !schemaName ||
      !isSafePgIdentifier(schemaName) ||
      schemaName === getControlSchema()
    ) {
      return null
    }
    deduped.add(schemaName)
  }

  return Array.from(deduped).sort((left, right) => left.localeCompare(right))
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

async function listAssignedSchemaNames(client: PoolClient, superadminId: number) {
  await ensureSchemaAccessTable(client)
  const result = await client.query<{ schema_name: string }>(
    `
      SELECT schema_name
      FROM ${getQuotedSchemaAccessTableRef()}
      WHERE superadmin_id = $1
      ORDER BY schema_name
    `,
    [superadminId]
  )

  return result.rows.map((row) => row.schema_name)
}

async function areSchemaNamesAccessibleToAdmin(
  client: PoolClient,
  adminId: number,
  schemaNames: string[]
) {
  const accessibleSchemaNames = await getAccessibleSchemaNames(client, adminId)
  accessibleSchemaNames.delete(getControlSchema())
  return schemaNames.every((schemaName) => accessibleSchemaNames.has(schemaName))
}

async function syncAssignedSchemas(
  client: PoolClient,
  superadminId: number,
  schemaNames: string[]
) {
  const currentSchemaNames = new Set(await listAssignedSchemaNames(client, superadminId))
  const nextSchemaNames = new Set(schemaNames)

  for (const schemaName of currentSchemaNames) {
    if (!nextSchemaNames.has(schemaName)) {
      await assignSchemaOwner(client, schemaName, null)
    }
  }

  for (const schemaName of nextSchemaNames) {
    if (!currentSchemaNames.has(schemaName)) {
      await assignSchemaOwner(client, schemaName, superadminId)
    }
  }
}

export async function GET(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  const client = await getPool().connect()
  try {
    const controlSchema = getControlSchema()
    await ensureSchemaAccessTable(client)
    const result = await client.query<SuperadminRow>(`
      SELECT id, email, created_at, test, password IS NOT NULL AS has_password
      FROM ${getQuotedControlTableRef()}
      ORDER BY id
    `)
    const assignedSchemasResult = await client.query<{
      superadmin_id: number
      schema_name: string
    }>(
      `
        SELECT superadmin_id, schema_name
        FROM ${getQuotedSchemaAccessTableRef()}
        ORDER BY schema_name
      `
    )
    const assignedSchemasByUser = new Map<number, string[]>()
    for (const row of assignedSchemasResult.rows) {
      const current = assignedSchemasByUser.get(row.superadmin_id) ?? []
      current.push(row.schema_name)
      assignedSchemasByUser.set(row.superadmin_id, current)
    }

    return NextResponse.json({
      success: true,
      users: result.rows.map((user) => ({
        ...user,
        db_role_name: getSuperadminDbRoleName(user.id),
        assigned_schemas: assignedSchemasByUser.get(user.id) ?? [],
      })),
      count: result.rows.length,
      schema: controlSchema,
      table: CONTROL_TABLE_NAME,
    })
  } catch (error) {
    console.error("Error fetching superadmins:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to fetch superadmins") },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  let body: SuperadminBody
  try {
    body = (await request.json()) as SuperadminBody
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    )
  }

  const email = readEmail(body.email)
  const password = readPassword(body.password)
  const test = readOptionalText(body.test)
  const schemaNames = readSchemaNames(body.schema_names)

  if (!email || !password) {
    return NextResponse.json(
      { success: false, error: "Email and password are required" },
      { status: 400 }
    )
  }
  if (body.schema_names !== undefined && schemaNames === null) {
    return NextResponse.json(
      { success: false, error: "Schema permissions are invalid" },
      { status: 400 }
    )
  }

  const client = await getPool().connect()
  let inTransaction = false
  try {
    await ensureSchemaAccessTable(client)
    if (
      schemaNames !== undefined &&
      !(await areSchemaNamesAccessibleToAdmin(client, auth.session.id, schemaNames))
    ) {
      return NextResponse.json(
        { success: false, error: "One or more selected schemas are outside your access scope" },
        { status: 403 }
      )
    }

    await client.query("BEGIN")
    inTransaction = true
    const tableRef = getQuotedControlTableRef()
    const result = await client.query<SuperadminRow>(
      `
        INSERT INTO ${tableRef} (email, password, test)
        VALUES ($1, $2, $3)
        RETURNING id, email, created_at, test, password IS NOT NULL AS has_password
      `,
      [email, hashPassword(password), test]
    )
    if (schemaNames !== undefined) {
      await syncAssignedSchemas(client, result.rows[0].id, schemaNames)
    }
    await syncAllIdentityDbRoles(client)
    await client.query("COMMIT")
    inTransaction = false

    return NextResponse.json({
      success: true,
      user: {
        ...result.rows[0],
        db_role_name: getSuperadminDbRoleName(result.rows[0].id),
        assigned_schemas:
          schemaNames !== undefined
            ? schemaNames
            : await listAssignedSchemaNames(client, result.rows[0].id),
      },
      message: `Superadmin ${email} created successfully`,
    })
  } catch (error) {
    if (inTransaction) {
      await client.query("ROLLBACK")
    }
    console.error("Error creating superadmin:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to create superadmin") },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}

export async function PUT(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  let body: SuperadminBody
  try {
    body = (await request.json()) as SuperadminBody
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    )
  }

  const id = readId(body.id)
  const email = readEmail(body.email)
  const password =
    body.password === undefined || body.password === "" ? null : readPassword(body.password)
  const test = body.test === undefined ? undefined : readOptionalText(body.test)
  const schemaNames = readSchemaNames(body.schema_names)

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
  if (body.schema_names !== undefined && schemaNames === null) {
    return NextResponse.json(
      { success: false, error: "Schema permissions are invalid" },
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
  if (test !== undefined) {
    assignments.push(`test = $${nextIndex}`)
    values.push(test)
  }

  const client = await getPool().connect()
  let inTransaction = false
  try {
    await ensureSchemaAccessTable(client)
    if (
      schemaNames !== undefined &&
      !(await areSchemaNamesAccessibleToAdmin(client, auth.session.id, schemaNames))
    ) {
      return NextResponse.json(
        { success: false, error: "One or more selected schemas are outside your access scope" },
        { status: 403 }
      )
    }

    await client.query("BEGIN")
    inTransaction = true
    const tableRef = getQuotedControlTableRef()
    const result = await client.query<SuperadminRow>(
      `
        UPDATE ${tableRef}
        SET ${assignments.join(", ")}
        WHERE id = $1
        RETURNING id, email, created_at, test, password IS NOT NULL AS has_password
      `,
      values
    )

    if (result.rowCount === 0) {
      await client.query("ROLLBACK")
      inTransaction = false
      return NextResponse.json(
        { success: false, error: "Superadmin not found" },
        { status: 404 }
      )
    }
    if (schemaNames !== undefined) {
      await syncAssignedSchemas(client, result.rows[0].id, schemaNames)
    }
    await syncAllIdentityDbRoles(client)
    await client.query("COMMIT")
    inTransaction = false

    return NextResponse.json({
      success: true,
      user: {
        ...result.rows[0],
        db_role_name: getSuperadminDbRoleName(result.rows[0].id),
        assigned_schemas:
          schemaNames !== undefined
            ? schemaNames
            : await listAssignedSchemaNames(client, result.rows[0].id),
      },
      message: `Superadmin ${email} updated successfully`,
    })
  } catch (error) {
    if (inTransaction) {
      await client.query("ROLLBACK")
    }
    console.error("Error updating superadmin:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to update superadmin") },
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
    const tableRef = getQuotedControlTableRef()
    const result = await client.query<{ id: number; email: string }>(
      `
        DELETE FROM ${tableRef}
        WHERE id = $1
        RETURNING id, email
      `,
      [id]
    )

    if (result.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: "Superadmin not found" },
        { status: 404 }
      )
    }
    await dropIdentityDbRole(client, getSuperadminDbRoleName(result.rows[0].id))
    await syncAllIdentityDbRoles(client)

    return NextResponse.json({
      success: true,
      message: `Superadmin ${result.rows[0].email} deleted successfully`,
    })
  } catch (error) {
    console.error("Error deleting superadmin:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to delete superadmin") },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
