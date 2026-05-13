import { NextRequest, NextResponse } from "next/server"
import { hashPassword } from "@/lib/auth/passwords"
import { requireAdminRequest } from "@/lib/auth/session"
import { CONTROL_TABLE_NAME, getControlSchema, getQuotedControlTableRef } from "@/lib/control-schema"
import { getPool } from "@/lib/db"

type SuperadminBody = {
  id?: unknown
  email?: unknown
  password?: unknown
  test?: unknown
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

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export async function GET(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  const client = await getPool().connect()
  try {
    const controlSchema = getControlSchema()
    const result = await client.query(`
      SELECT id, email, created_at, test, password IS NOT NULL AS has_password
      FROM ${getQuotedControlTableRef()}
      ORDER BY id
    `)

    return NextResponse.json({
      success: true,
      users: result.rows,
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

  if (!email || !password) {
    return NextResponse.json(
      { success: false, error: "Email and password are required" },
      { status: 400 }
    )
  }

  const client = await getPool().connect()
  try {
    const tableRef = getQuotedControlTableRef()
    const result = await client.query(
      `
        INSERT INTO ${tableRef} (email, password, test)
        VALUES ($1, $2, $3)
        RETURNING id, email, created_at, test, password IS NOT NULL AS has_password
      `,
      [email, hashPassword(password), test]
    )

    return NextResponse.json({
      success: true,
      user: result.rows[0],
      message: `Superadmin ${email} created successfully`,
    })
  } catch (error) {
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
  try {
    const tableRef = getQuotedControlTableRef()
    const result = await client.query(
      `
        UPDATE ${tableRef}
        SET ${assignments.join(", ")}
        WHERE id = $1
        RETURNING id, email, created_at, test, password IS NOT NULL AS has_password
      `,
      values
    )

    if (result.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: "Superadmin not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      user: result.rows[0],
      message: `Superadmin ${email} updated successfully`,
    })
  } catch (error) {
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
    const result = await client.query(
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
