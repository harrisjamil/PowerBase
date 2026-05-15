import { NextRequest, NextResponse } from "next/server"
import type { PrincipalSession } from "@/lib/auth/principal-session"
import { requirePrincipalRequest } from "@/lib/auth/principal-session"
import { getPool } from "@/lib/db"
import { parseProjectLookup } from "@/lib/project-ref"
import {
  ensureProjectRoleAssignmentsTable,
  ensureProjectsTable,
  getProjectRecordByLookup,
} from "@/lib/projects"
import { canPrincipalAccessSchema } from "@/lib/principal-access"

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function getPrincipalRoleName(session: PrincipalSession): string {
  return session.principalType === "superadmin" ? session.email : session.username
}

function isProjectCreator(
  creatorRoleName: string | null,
  principalRoleName: string
): boolean {
  if (!creatorRoleName) return false
  return creatorRoleName.toLowerCase() === principalRoleName.toLowerCase()
}

function canPrincipalManageProject(
  session: PrincipalSession,
  creatorRoleName: string | null
): boolean {
  if (session.principalType === "superadmin") {
    return true
  }
  return isProjectCreator(creatorRoleName, session.username)
}

type AssignableRoleRow = {
  oid: number
  username: string
  can_login: boolean
  is_system_role: boolean
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
    await ensureProjectRoleAssignmentsTable(client)

    const project = await getProjectRecordByLookup(client, rawId)
    if (
      !project ||
      !(await canPrincipalAccessSchema(client, auth.session, project.schema_name))
    ) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      )
    }

    if (!canPrincipalManageProject(auth.session, project.creator_role_name)) {
      return NextResponse.json(
        { success: false, error: "Only the project creator can manage access" },
        { status: 403 }
      )
    }

    const result = await client.query<AssignableRoleRow>(
      `
        SELECT
          roles.oid::int AS oid,
          roles.rolname AS username,
          roles.rolcanlogin AS can_login,
          (roles.rolname = 'postgres' OR roles.rolname LIKE 'pg_%') AS is_system_role
        FROM pg_catalog.pg_roles roles
        WHERE NOT (roles.rolname = 'postgres' OR roles.rolname LIKE 'pg_%')
        ORDER BY lower(roles.rolname), roles.oid
      `
    )

    const creatorRoleName = project.creator_role_name
    const roles = result.rows.filter(
      (role) =>
        role.can_login &&
        !role.is_system_role &&
        (!creatorRoleName ||
          role.username.toLowerCase() !== creatorRoleName.toLowerCase())
    )

    return NextResponse.json({
      success: true,
      roles,
      creator_role_name: creatorRoleName,
      current_role_name: getPrincipalRoleName(auth.session),
    })
  } catch (error) {
    console.error("Error fetching assignable roles:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to fetch assignable roles") },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
