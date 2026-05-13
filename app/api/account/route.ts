import { NextRequest, NextResponse } from "next/server"
import { hashPassword, verifyPassword } from "@/lib/auth/passwords"
import {
  adminSessionPublicUser,
  createAdminSession,
  requireAdminRequest,
  setAdminSessionCookie,
} from "@/lib/auth/session"
import { getQuotedControlTableRef } from "@/lib/control-schema"
import { getPool } from "@/lib/db"

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
    const currentUserResult = await client.query<{ id: number; email: string; password: string }>(
      `
        SELECT id, email, password
        FROM ${getQuotedControlTableRef()}
        WHERE id = $1
        LIMIT 1
      `,
      [auth.session.id]
    )

    const currentUser = currentUserResult.rows[0]
    if (!currentUser) {
      return NextResponse.json({ success: false, error: "Current user was not found." }, { status: 404 })
    }

    if (newPassword) {
      if (!currentPassword || !verifyPassword(currentPassword, currentUser.password)) {
        return NextResponse.json(
          { success: false, error: "Current password is incorrect." },
          { status: 400 }
        )
      }
    }

    const assignments: string[] = []
    const values: Array<string | number> = []
    let nextIndex = 1

    if (nextEmail && nextEmail !== currentUser.email) {
      assignments.push(`email = $${nextIndex}`)
      values.push(nextEmail)
      nextIndex += 1
    }

    if (newPassword) {
      assignments.push(`password = $${nextIndex}`)
      values.push(hashPassword(newPassword))
      nextIndex += 1
    }

    if (assignments.length === 0) {
      return NextResponse.json({
        success: true,
        user: adminSessionPublicUser(auth.session),
      })
    }

    values.push(auth.session.id)
    const result = await client.query<{ id: number; email: string }>(
      `
        UPDATE ${getQuotedControlTableRef()}
        SET ${assignments.join(", ")}
        WHERE id = $${nextIndex}
        RETURNING id, email
      `,
      values
    )

    const updatedUser = result.rows[0]
    const response = NextResponse.json({
      success: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        controlSchema: auth.session.controlSchema,
      },
    })

    return setAdminSessionCookie(
      response,
      createAdminSession({
        id: updatedUser.id,
        email: updatedUser.email,
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
