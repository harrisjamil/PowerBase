import { NextRequest, NextResponse } from "next/server"
import { requirePrincipalRequest } from "@/lib/auth/principal-session"
import { getPool } from "@/lib/db"
import { parseProjectLookup } from "@/lib/project-ref"
import {
  getProjectApiBaseUrl,
  listProjectApiKeys,
  regenerateProjectApiKey,
  type ProjectApiKeyType,
} from "@/lib/project-api-keys"
import { ensureProjectsTable, getProjectRecordByLookup } from "@/lib/projects"
import { canPrincipalManageProject } from "@/lib/principal-access"

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function readKeyType(value: unknown): ProjectApiKeyType | null {
  if (value === "anon" || value === "service_role") {
    return value
  }
  return null
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = requirePrincipalRequest(request)
  if (!auth.ok) return auth.response

  const { id: rawId } = await context.params
  if (!parseProjectLookup(rawId)) {
    return NextResponse.json(
      { success: false, error: "Invalid project ID" },
      { status: 400 }
    )
  }

  const client = await getPool().connect()
  try {
    await ensureProjectsTable(client)

    const project = await getProjectRecordByLookup(client, rawId)
    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      )
    }

    const canManage = canPrincipalManageProject(auth.session, project.creator_role_name)
    if (!canManage) {
      return NextResponse.json(
        { success: false, error: "Only project owners can view API keys" },
        { status: 403 }
      )
    }

    const apiKeys = await listProjectApiKeys(client, project.id)
    const projectUrl = getProjectApiBaseUrl(project.project_ref, request.nextUrl.origin)

    return NextResponse.json({
      success: true,
      project_id: project.id,
      project_ref: project.project_ref,
      schema_name: project.schema_name,
      project_url: projectUrl,
      api_keys: apiKeys,
    })
  } catch (error) {
    console.error("Error fetching project API keys:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to fetch API keys") },
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
  const auth = requirePrincipalRequest(request)
  if (!auth.ok) return auth.response

  const { id: rawId } = await context.params
  if (!parseProjectLookup(rawId)) {
    return NextResponse.json(
      { success: false, error: "Invalid project ID" },
      { status: 400 }
    )
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    )
  }

  const keyType = readKeyType(body.type)
  if (!keyType) {
    return NextResponse.json(
      { success: false, error: "A valid key type is required (anon or service_role)" },
      { status: 400 }
    )
  }

  const client = await getPool().connect()
  try {
    await ensureProjectsTable(client)

    const project = await getProjectRecordByLookup(client, rawId)
    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      )
    }

    const canManage = canPrincipalManageProject(auth.session, project.creator_role_name)
    if (!canManage) {
      return NextResponse.json(
        { success: false, error: "Only project owners can regenerate API keys" },
        { status: 403 }
      )
    }

    const apiKey = await regenerateProjectApiKey(
      client,
      project.id,
      keyType,
      project.project_ref
    )

    return NextResponse.json({
      success: true,
      api_key: apiKey,
    })
  } catch (error) {
    console.error("Error regenerating project API key:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to regenerate API key") },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
