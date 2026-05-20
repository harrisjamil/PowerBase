import { NextRequest, NextResponse } from "next/server"
import { requireAdminRequest } from "@/lib/auth/session"
import { getPool } from "@/lib/db"
import { getTeamById } from "@/lib/teams"

function readId(value: string): number | null {
  if (/^\d+$/.test(value)) return Number(value)
  return null
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  const { id: idParam } = await context.params
  const id = readId(idParam)
  if (!id) {
    return NextResponse.json(
      { success: false, error: "Invalid team id" },
      { status: 400 }
    )
  }

  const client = await getPool().connect()
  try {
    const team = await getTeamById(client, id)
    if (!team) {
      return NextResponse.json(
        { success: false, error: "Team not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      team: {
        id: String(team.id),
        name: team.name,
        description: team.description ?? "",
        memberCount: team.member_count,
        createdAt: team.created_at,
        updatedAt: team.updated_at,
        privacy: team.privacy,
        owner: team.owner ?? "—",
      },
    })
  } catch (error) {
    console.error("Get team error:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to fetch team") },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
