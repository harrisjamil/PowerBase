import { NextRequest, NextResponse } from "next/server"
import { requireAdminRequest } from "@/lib/auth/session"
import { getPool } from "@/lib/db"
import {
  createPostgresRole,
  dropPostgresRole,
  getPostgresRoleByName,
  getPostgresRoleByOid,
  listGrantableSchemas,
  listPostgresRoles,
  readRoleName,
  readRolePassword,
  readSchemaNames,
  updatePostgresRole,
} from "@/lib/postgres-roles"

type DbUserBody = {
  oid?: unknown
  username?: unknown
  password?: unknown
  can_login?: unknown
  is_admin?: unknown
  is_superuser?: unknown
  can_create_db?: unknown
  can_create_role?: unknown
  schema_names?: unknown
}

function readOid(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value)
  return null
}

function readBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export async function GET(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  const client = await getPool().connect()
  try {
    const [users, schemas] = await Promise.all([
      listPostgresRoles(client),
      listGrantableSchemas(client),
    ])

    return NextResponse.json({
      success: true,
      users,
      schemas,
      count: users.length,
    })
  } catch (error) {
    console.error("PostgreSQL roles error:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to fetch PostgreSQL users") },
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
  const password = readRolePassword(body.password)
  const schemaNames = readSchemaNames(body.schema_names)
  const canLogin = readBoolean(body.can_login, true)
  const isAdmin = readBoolean(body.is_admin)
  const isSuperuser = readBoolean(body.is_superuser)
  const canCreateDb = readBoolean(body.can_create_db)
  const canCreateRole = readBoolean(body.can_create_role)

  if (!username || !password) {
    return NextResponse.json(
      { success: false, error: "Username and password are required" },
      { status: 400 }
    )
  }
  if (schemaNames === null) {
    return NextResponse.json(
      { success: false, error: "Schema permissions are invalid" },
      { status: 400 }
    )
  }

  const client = await getPool().connect()
  let inTransaction = false
  try {
    const existingRole = await getPostgresRoleByName(client, username)
    if (existingRole) {
      return NextResponse.json(
        { success: false, error: "A PostgreSQL role with this name already exists" },
        { status: 409 }
      )
    }

    await client.query("BEGIN")
    inTransaction = true
    await createPostgresRole(client, {
      username,
      password,
      canLogin,
      isAdmin,
      isSuperuser,
      canCreateDb,
      canCreateRole,
      schemaNames: schemaNames ?? [],
    })
    const createdRole = await getPostgresRoleByName(client, username)
    await client.query("COMMIT")
    inTransaction = false

    return NextResponse.json({
      success: true,
      user: createdRole,
      message: `PostgreSQL role ${username} created successfully`,
    })
  } catch (error) {
    if (inTransaction) {
      await client.query("ROLLBACK")
    }
    console.error("Create PostgreSQL role error:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to create PostgreSQL role") },
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

  const oid = readOid(body.oid)
  const username = readRoleName(body.username)
  const password =
    body.password === undefined || body.password === "" ? null : readRolePassword(body.password)
  const schemaNames = readSchemaNames(body.schema_names)
  const canLogin = readBoolean(body.can_login, true)
  const isAdmin = readBoolean(body.is_admin)
  const isSuperuser = readBoolean(body.is_superuser)
  const canCreateDb = readBoolean(body.can_create_db)
  const canCreateRole = readBoolean(body.can_create_role)

  if (!oid || !username) {
    return NextResponse.json(
      { success: false, error: "OID and username are required" },
      { status: 400 }
    )
  }
  if (body.password !== undefined && body.password !== "" && !password) {
    return NextResponse.json(
      { success: false, error: "Password is invalid" },
      { status: 400 }
    )
  }
  if (schemaNames === null) {
    return NextResponse.json(
      { success: false, error: "Schema permissions are invalid" },
      { status: 400 }
    )
  }

  const client = await getPool().connect()
  let inTransaction = false
  try {
    const existingRole = await getPostgresRoleByOid(client, oid)
    if (!existingRole) {
      return NextResponse.json(
        { success: false, error: "PostgreSQL role not found" },
        { status: 404 }
      )
    }

    const conflictingRole = await getPostgresRoleByName(client, username)
    if (conflictingRole && conflictingRole.oid !== oid) {
      return NextResponse.json(
        { success: false, error: "A PostgreSQL role with this name already exists" },
        { status: 409 }
      )
    }

    await client.query("BEGIN")
    inTransaction = true
    await updatePostgresRole(client, existingRole.username, {
      nextUsername: username,
      password,
      canLogin,
      isAdmin,
      isSuperuser,
      canCreateDb,
      canCreateRole,
      schemaNames: schemaNames ?? [],
    })
    const updatedRole = await getPostgresRoleByName(client, username)
    await client.query("COMMIT")
    inTransaction = false

    return NextResponse.json({
      success: true,
      user: updatedRole,
      message: `PostgreSQL role ${username} updated successfully`,
    })
  } catch (error) {
    if (inTransaction) {
      await client.query("ROLLBACK")
    }
    console.error("Update PostgreSQL role error:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to update PostgreSQL role") },
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
  const oid = readOid(searchParams.get("oid"))
  if (!oid) {
    return NextResponse.json(
      { success: false, error: "OID is required" },
      { status: 400 }
    )
  }

  const client = await getPool().connect()
  let inTransaction = false
  try {
    const existingRole = await getPostgresRoleByOid(client, oid)
    if (!existingRole) {
      return NextResponse.json(
        { success: false, error: "PostgreSQL role not found" },
        { status: 404 }
      )
    }

    await client.query("BEGIN")
    inTransaction = true
    await dropPostgresRole(client, existingRole.username)
    await client.query("COMMIT")
    inTransaction = false

    return NextResponse.json({
      success: true,
      message: `PostgreSQL role ${existingRole.username} deleted successfully`,
    })
  } catch (error) {
    if (inTransaction) {
      await client.query("ROLLBACK")
    }
    console.error("Delete PostgreSQL role error:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to delete PostgreSQL role") },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
