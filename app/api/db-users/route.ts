import { NextRequest, NextResponse } from "next/server"
import { requireAdminRequest } from "@/lib/auth/session"
import { getPool } from "@/lib/db"

type DbUserBody = {
  username?: unknown
  password?: unknown
  new_password?: unknown
  can_create_db?: unknown
  can_create_role?: unknown
  is_superuser?: unknown
  is_replication?: unknown
  bypass_rls?: unknown
}

function readRoleName(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 63 || trimmed.includes("\0")) return null
  return trimmed
}

function readPassword(value: unknown): string | null {
  if (typeof value !== "string") return null
  if (!value || value.length > 512 || value.includes("\0")) return null
  return value
}

function bool(value: unknown): boolean {
  return value === true
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function roleAttributes(input: {
  can_create_db: boolean
  can_create_role: boolean
  is_superuser: boolean
  is_replication: boolean
  bypass_rls: boolean
}) {
  return [
    input.can_create_db ? "CREATEDB" : "NOCREATEDB",
    input.can_create_role ? "CREATEROLE" : "NOCREATEROLE",
    input.is_superuser ? "SUPERUSER" : "NOSUPERUSER",
    input.is_replication ? "REPLICATION" : "NOREPLICATION",
    input.bypass_rls ? "BYPASSRLS" : "NOBYPASSRLS",
  ].join(" ")
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export async function GET(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  const client = await getPool().connect()
  try {
    const [usersResult, metaResult] = await Promise.all([
      client.query(`
        SELECT
          r.rolname AS username,
          r.rolcreatedb AS can_create_db,
          r.rolcreaterole AS can_create_role,
          r.rolsuper AS is_superuser,
          r.rolreplication AS is_replication,
          r.rolbypassrls AS bypass_rls,
          a.rolpassword IS NOT NULL AS has_password,
          r.rolvaliduntil::text AS password_expiry
        FROM pg_roles r
        LEFT JOIN pg_authid a ON r.oid = a.oid
        WHERE r.rolcanlogin = true
        ORDER BY r.rolname
      `),
      client.query(`
        SELECT current_database() AS database_name, current_user AS current_user
      `),
    ])

    return NextResponse.json({
      success: true,
      users: usersResult.rows,
      count: usersResult.rows.length,
      database: metaResult.rows[0]?.database_name ?? null,
      currentUser: metaResult.rows[0]?.current_user ?? null,
    })
  } catch (error) {
    console.error("Database error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch database users" },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  let body: DbUserBody
  try {
    body = (await request.json()) as DbUserBody
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    )
  }

  const username = readRoleName(body.username)
  const password = readPassword(body.password)
  if (!username || !password) {
    return NextResponse.json(
      { success: false, error: "Username and password are required" },
      { status: 400 }
    )
  }

  const role = quoteIdentifier(username)
  const attributes = roleAttributes({
    can_create_db: bool(body.can_create_db),
    can_create_role: bool(body.can_create_role),
    is_superuser: bool(body.is_superuser),
    is_replication: bool(body.is_replication),
    bypass_rls: bool(body.bypass_rls),
  })

  const client = await getPool().connect()
  let inTransaction = false
  try {
    await client.query("BEGIN")
    inTransaction = true
    await client.query(`CREATE USER ${role} WITH PASSWORD ${quoteLiteral(password)}`)
    await client.query(`ALTER USER ${role} WITH ${attributes}`)
    await client.query("COMMIT")
    inTransaction = false

    return NextResponse.json({
      success: true,
      message: `User ${username} created successfully`,
    })
  } catch (error) {
    if (inTransaction) {
      await client.query("ROLLBACK")
    }
    console.error("Error creating user:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to create user") },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}

export async function PUT(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  let body: DbUserBody
  try {
    body = (await request.json()) as DbUserBody
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    )
  }

  const username = readRoleName(body.username)
  if (!username) {
    return NextResponse.json(
      { success: false, error: "Username is required" },
      { status: 400 }
    )
  }

  const newPassword =
    body.new_password === undefined || body.new_password === ""
      ? null
      : readPassword(body.new_password)
  if (body.new_password !== undefined && body.new_password !== "" && !newPassword) {
    return NextResponse.json(
      { success: false, error: "New password is invalid" },
      { status: 400 }
    )
  }

  const role = quoteIdentifier(username)
  const attributes = roleAttributes({
    can_create_db: bool(body.can_create_db),
    can_create_role: bool(body.can_create_role),
    is_superuser: bool(body.is_superuser),
    is_replication: bool(body.is_replication),
    bypass_rls: bool(body.bypass_rls),
  })

  const client = await getPool().connect()
  let inTransaction = false
  try {
    await client.query("BEGIN")
    inTransaction = true
    await client.query(
      `ALTER USER ${role} WITH ${attributes}${newPassword ? ` PASSWORD ${quoteLiteral(newPassword)}` : ""}`
    )
    await client.query("COMMIT")
    inTransaction = false

    return NextResponse.json({
      success: true,
      message: `User ${username} updated successfully`,
    })
  } catch (error) {
    if (inTransaction) {
      await client.query("ROLLBACK")
    }
    console.error("Error updating user:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to update user") },
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
  const username = readRoleName(searchParams.get("username"))
  if (!username) {
    return NextResponse.json(
      { success: false, error: "Username is required" },
      { status: 400 }
    )
  }

  const client = await getPool().connect()
  let inTransaction = false
  try {
    const meta = await client.query<{ current_user: string }>(
      `SELECT current_user AS current_user`
    )
    const currentUser = meta.rows[0]?.current_user ?? ""
    if (username === currentUser) {
      return NextResponse.json(
        { success: false, error: "You cannot delete the current database user." },
        { status: 400 }
      )
    }

    const role = quoteIdentifier(username)
    const currentRole = quoteIdentifier(currentUser)
    await client.query("BEGIN")
    inTransaction = true
    await client.query(`REASSIGN OWNED BY ${role} TO ${currentRole}`)
    await client.query(`DROP OWNED BY ${role}`)
    await client.query(`DROP USER IF EXISTS ${role}`)
    await client.query("COMMIT")
    inTransaction = false

    return NextResponse.json({
      success: true,
      message: `User ${username} deleted successfully`,
    })
  } catch (error) {
    if (inTransaction) {
      await client.query("ROLLBACK")
    }
    console.error("Error deleting user:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to delete user") },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}