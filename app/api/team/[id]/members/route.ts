import { NextRequest, NextResponse } from "next/server"
import { requireAdminRequest } from "@/lib/auth/session"
import { getPool } from "@/lib/db"
import {
  addTeamMember,
  listTeamMembers,
  readTeamMemberRole,
  readTeamMemberStatus,
  removeTeamMember,
  updateTeamMember,
} from "@/lib/teams"

type AddMemberBody = {
  pgUsername?: unknown
  role?: unknown
}

type UpdateMemberBody = {
  memberId?: unknown
  role?: unknown
  status?: unknown
}

function readTeamId(value: string): number | null {
  if (/^\d+$/.test(value)) return Number(value)
  return null
}

function readMemberId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value)
  return null
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function serializeMember(member: Awaited<ReturnType<typeof listTeamMembers>>[number]) {
  return {
    id: String(member.id),
    name: member.pg_username,
    email: `${member.pg_username}@database`,
    role: member.role,
    status: member.status,
    joinedAt: member.joined_at,
    pgUsername: member.pg_username,
    canLogin: member.can_login,
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  const { id: idParam } = await context.params
  const teamId = readTeamId(idParam)
  if (!teamId) {
    return NextResponse.json(
      { success: false, error: "Invalid team id" },
      { status: 400 }
    )
  }

  const client = await getPool().connect()
  try {
    const members = await listTeamMembers(client, teamId)
    return NextResponse.json({
      success: true,
      members: members.map(serializeMember),
    })
  } catch (error) {
    console.error("List team members error:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to fetch team members") },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  const { id: idParam } = await context.params
  const teamId = readTeamId(idParam)
  if (!teamId) {
    return NextResponse.json(
      { success: false, error: "Invalid team id" },
      { status: 400 }
    )
  }

  let body: AddMemberBody
  try {
    body = (await request.json()) as AddMemberBody
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    )
  }

  const pgUsername = typeof body.pgUsername === "string" ? body.pgUsername.trim() : ""
  if (!pgUsername) {
    return NextResponse.json(
      { success: false, error: "PostgreSQL username is required" },
      { status: 400 }
    )
  }

  const role = readTeamMemberRole(body.role) ?? "member"

  const client = await getPool().connect()
  try {
    const member = await addTeamMember(client, teamId, { pgUsername, role })
    return NextResponse.json({
      success: true,
      member: serializeMember(member),
    })
  } catch (error) {
    console.error("Add team member error:", error)
    const pgError = error as { code?: string }
    const message = errorMessage(error, "Failed to add team member")
    const status =
      message.includes("not found") || message.includes("does not exist")
        ? 400
        : pgError.code === "23505" || message.includes("duplicate") || message.includes("unique")
          ? 409
          : 500
    return NextResponse.json(
      {
        success: false,
        error:
          pgError.code === "23505"
            ? "This user is already a member of the team"
            : message,
      },
      { status }
    )
  } finally {
    client.release()
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  const { id: idParam } = await context.params
  const teamId = readTeamId(idParam)
  if (!teamId) {
    return NextResponse.json(
      { success: false, error: "Invalid team id" },
      { status: 400 }
    )
  }

  let body: UpdateMemberBody
  try {
    body = (await request.json()) as UpdateMemberBody
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    )
  }

  const memberId = readMemberId(body.memberId)
  if (!memberId) {
    return NextResponse.json(
      { success: false, error: "Member id is required" },
      { status: 400 }
    )
  }

  const role = body.role === undefined ? undefined : readTeamMemberRole(body.role)
  const status = body.status === undefined ? undefined : readTeamMemberStatus(body.status)

  if (body.role !== undefined && !role) {
    return NextResponse.json(
      { success: false, error: "Invalid role" },
      { status: 400 }
    )
  }
  if (body.status !== undefined && !status) {
    return NextResponse.json(
      { success: false, error: "Invalid status" },
      { status: 400 }
    )
  }
  if (role === undefined && status === undefined) {
    return NextResponse.json(
      { success: false, error: "Nothing to update" },
      { status: 400 }
    )
  }

  const client = await getPool().connect()
  try {
    const member = await updateTeamMember(client, teamId, memberId, { role: role ?? undefined, status: status ?? undefined })
    return NextResponse.json({
      success: true,
      member: serializeMember(member),
    })
  } catch (error) {
    console.error("Update team member error:", error)
    const message = errorMessage(error, "Failed to update team member")
    const status = message.includes("not found") ? 404 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  } finally {
    client.release()
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  const { id: idParam } = await context.params
  const teamId = readTeamId(idParam)
  if (!teamId) {
    return NextResponse.json(
      { success: false, error: "Invalid team id" },
      { status: 400 }
    )
  }

  const { searchParams } = new URL(request.url)
  const memberId = readMemberId(searchParams.get("memberId"))
  if (!memberId) {
    return NextResponse.json(
      { success: false, error: "Member id is required" },
      { status: 400 }
    )
  }

  const client = await getPool().connect()
  try {
    const removed = await removeTeamMember(client, teamId, memberId)
    if (!removed) {
      return NextResponse.json(
        { success: false, error: "Team member not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Remove team member error:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to remove team member") },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
