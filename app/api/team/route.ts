import { NextRequest, NextResponse } from "next/server"
import { requireAdminRequest } from "@/lib/auth/session"
import { getPool } from "@/lib/db"
import {
  createTeam,
  deleteTeam,
  listTeams,
  readPgUsernames,
  readTeamPrivacy,
} from "@/lib/teams"

type CreateTeamBody = {
  name?: unknown
  description?: unknown
  privacy?: unknown
  memberUsernames?: unknown
}

function readId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value)
  return null
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function serializeTeam(team: Awaited<ReturnType<typeof listTeams>>[number]) {
  return {
    id: String(team.id),
    name: team.name,
    description: team.description ?? "",
    memberCount: team.member_count,
    createdAt: team.created_at,
    updatedAt: team.updated_at,
    privacy: team.privacy,
    owner: team.owner ?? undefined,
  }
}

export async function GET(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  const client = await getPool().connect()
  try {
    const teams = await listTeams(client)
    return NextResponse.json({
      success: true,
      teams: teams.map(serializeTeam),
    })
  } catch (error) {
    console.error("List teams error:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to fetch teams") },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  let body: CreateTeamBody
  try {
    body = (await request.json()) as CreateTeamBody
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    )
  }

  const name = typeof body.name === "string" ? body.name.trim() : ""
  if (!name) {
    return NextResponse.json(
      { success: false, error: "Team name is required" },
      { status: 400 }
    )
  }

  const privacy = readTeamPrivacy(body.privacy) ?? "private"
  const memberUsernames = readPgUsernames(body.memberUsernames)
  if (body.memberUsernames !== undefined && memberUsernames === null) {
    return NextResponse.json(
      { success: false, error: "Member usernames are invalid" },
      { status: 400 }
    )
  }

  const client = await getPool().connect()
  let inTransaction = false
  try {
    await client.query("BEGIN")
    inTransaction = true

    const team = await createTeam(client, {
      name,
      description: typeof body.description === "string" ? body.description : null,
      privacy,
      memberUsernames: memberUsernames ?? [],
    })

    await client.query("COMMIT")
    inTransaction = false

    return NextResponse.json({
      success: true,
      team: serializeTeam(team),
    })
  } catch (error) {
    if (inTransaction) {
      await client.query("ROLLBACK")
    }
    console.error("Create team error:", error)
    const message = errorMessage(error, "Failed to create team")
    const status = message.includes("does not exist") ? 400 : 500
    return NextResponse.json({ success: false, error: message }, { status })
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
      { success: false, error: "Team id is required" },
      { status: 400 }
    )
  }

  const client = await getPool().connect()
  try {
    const deleted = await deleteTeam(client, id)
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: "Team not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete team error:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to delete team") },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
