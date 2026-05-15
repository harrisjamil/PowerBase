import { NextRequest, NextResponse } from "next/server"
import {
  adminSessionPublicUser,
  createAdminSession,
  requireAdminRequest,
  setAdminSessionCookie,
} from "@/lib/auth/session"
import { quotePgIdentifier } from "@/lib/control-schema"
import { getPool } from "@/lib/db"
import { authenticatePostgresRole, getPostgresRoleByOid, readRoleName } from "@/lib/postgres-roles"

function readEmail(value: unknown): string | null {
  return readRoleName(value)
}

function readPassword(value: unknown): string | null {
  if (typeof value !== "string") return null
  if (!value || value.length > 512) return null
  return value
}

export async function GET(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  return NextResponse.json({
    success: true,
    user: adminSessionPublicUser(auth.session),
  })
}

export async function PATCH(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const nextEmail = body.email === undefined ? undefined : readEmail(body.email)
  const currentPassword =
    body.currentPassword === undefined ? undefined : readPassword(body.currentPassword)
  const newPassword = body.newPassword === undefined ? undefined : readPassword(body.newPassword)

  if (body.email !== undefined && !nextEmail) {
    return NextResponse.json({ success: false, error: "Enter a valid email address." }, { status: 400 })
  }
  if (body.currentPassword !== undefined && !currentPassword) {
    return NextResponse.json({ success: false, error: "Current password is required." }, { status: 400 })
  }
  if (body.newPassword !== undefined && !newPassword) {
    return NextResponse.json({ success: false, error: "Enter a valid new password." }, { status: 400 })
  }
  if (!nextEmail && !newPassword) {
    return NextResponse.json({ success: false, error: "No account changes were provided." }, { status: 400 })
  }

  const client = await getPool().connect()
  try {
    const currentUser = await getPostgresRoleByOid(client, auth.session.id)
    if (!currentUser) {
      return NextResponse.json({ success: false, error: "Current user was not found." }, { status: 404 })
    }

    if (newPassword) {
      if (!currentPassword || !(await authenticatePostgresRole(currentUser.username, currentPassword))) {
        return NextResponse.json(
          { success: false, error: "Current password is incorrect." },
          { status: 400 }
        )
      }
    }

    if (!nextEmail && !newPassword) {
      return NextResponse.json({
        success: true,
        user: adminSessionPublicUser(auth.session),
      })
    }

    const nextUsername = nextEmail && nextEmail !== currentUser.username ? nextEmail : currentUser.username
    if (nextUsername !== currentUser.username) {
      await client.query(
        `ALTER ROLE ${quotePgIdentifier(currentUser.username)} RENAME TO ${quotePgIdentifier(nextUsername)}`
      )
    }
    if (newPassword) {
      await client.query(
        `ALTER ROLE ${quotePgIdentifier(nextUsername)} WITH PASSWORD '${newPassword.replace(/'/g, "''")}'`
      )
    }

    const response = NextResponse.json({
      success: true,
      user: {
        id: auth.session.id,
        email: nextUsername,
        controlSchema: auth.session.controlSchema,
      },
    })

    return setAdminSessionCookie(
      response,
      createAdminSession({
        id: auth.session.id,
        email: nextUsername,
        controlSchema: auth.session.controlSchema,
      })
    )
  } catch (error) {
    console.error("Error updating account:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to update account" },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
