import { NextRequest, NextResponse } from "next/server"
import { requireAdminRequest } from "@/lib/auth/session"
import { getPool } from "@/lib/db"
import {
  assignTeamProjects,
  listTeamProjects,
  readProjectIds,
  unassignTeamProject,
} from "@/lib/teams"

type AssignProjectsBody = {
  projectIds?: unknown
}

function readTeamId(value: string): number | null {
  if (/^\d+$/.test(value)) return Number(value)
  return null
}

function readProjectId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value)
  return null
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function serializeProject(project: Awaited<ReturnType<typeof listTeamProjects>>[number]) {
  return {
    id: String(project.id),
    assignmentId: String(project.id),
    projectId: project.project_id,
    projectRef: project.project_ref,
    name: project.project_name,
    schemaName: project.schema_name,
    description: project.description ?? "",
    status: project.status,
    assignedAt: project.assigned_at,
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
    const projects = await listTeamProjects(client, teamId)
    return NextResponse.json({
      success: true,
      projects: projects.map(serializeProject),
    })
  } catch (error) {
    console.error("List team projects error:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to fetch team projects") },
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

  let body: AssignProjectsBody
  try {
    body = (await request.json()) as AssignProjectsBody
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    )
  }

  const projectIds = readProjectIds(body.projectIds)
  if (!projectIds || projectIds.length === 0) {
    return NextResponse.json(
      { success: false, error: "Select at least one project" },
      { status: 400 }
    )
  }

  const client = await getPool().connect()
  try {
    const projects = await assignTeamProjects(client, teamId, projectIds)
    return NextResponse.json({
      success: true,
      projects: projects.map(serializeProject),
    })
  } catch (error) {
    console.error("Assign team projects error:", error)
    const message = errorMessage(error, "Failed to assign projects")
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
  const projectId = readProjectId(searchParams.get("projectId"))
  if (!projectId) {
    return NextResponse.json(
      { success: false, error: "Project id is required" },
      { status: 400 }
    )
  }

  const client = await getPool().connect()
  try {
    const removed = await unassignTeamProject(client, teamId, projectId)
    if (!removed) {
      return NextResponse.json(
        { success: false, error: "Project assignment not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Unassign team project error:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to unassign project") },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
