import { NextRequest, NextResponse } from "next/server"
import type { PrincipalSession } from "@/lib/auth/principal-session"
import { requirePrincipalRequest } from "@/lib/auth/principal-session"
import { getPool } from "@/lib/db"
import { getQuotedProjectsTableRef } from "@/lib/control-schema"
import { parseProjectLookup } from "@/lib/project-ref"
import {
  ensureProjectRoleAssignmentsTable,
  ensureProjectsTable,
  getProjectRecordById,
  getProjectRecordByLookup,
  getQuotedProjectRoleAssignmentsTableRef,
  listProjectRoleAssignments,
  removeProjectRecord,
  renameProjectRecord,
  replaceProjectRoleAssignments,
} from "@/lib/projects"
import { listEffectiveProjectAssignees } from "@/lib/project-team-sync"
import { canPrincipalAccessSchema } from "@/lib/principal-access"
import {
  listMissingPostgresRoleNames,
  readRoleNames,
  syncProjectRoleSchemaAccess,
} from "@/lib/postgres-roles"

type ProjectRow = {
  id: number
  project_ref: string
  name: string
  schema_name: string
  description: string | null
  status: string
  created_at: string | null
  updated_at: string | null
  creator_role_name: string | null
  owner: string | null
  table_count: number
  total_size: string
  assigned_role_names: string[] | null
  assigned_role_count: number
}

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

function readProjectName(value: unknown) {
  if (value === undefined) return undefined
  if (typeof value !== "string") return null
  const name = value.trim()
  if (!name || name.length > 255) return null
  return name
}

function readDescription(value: unknown) {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== "string") return null
  const description = value.trim()
  return description || null
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

  const lite = request.nextUrl.searchParams.get("lite") === "1"

  const client = await getPool().connect()
  try {
    await ensureProjectsTable(client)
    await ensureProjectRoleAssignmentsTable(client)

    const projectRecord = await getProjectRecordByLookup(client, rawId)
    if (!projectRecord) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      )
    }

    const result = await client.query<ProjectRow>(
      lite
        ? `
        SELECT
          projects.id,
          projects.project_ref,
          projects.name,
          projects.schema_name,
          projects.description,
          projects.status,
          projects.created_at::text,
          projects.updated_at::text,
          projects.creator_role_name,
          COALESCE(pg_catalog.pg_get_userbyid(n.nspowner), 'unknown') AS owner,
          0::int AS table_count,
          '0 bytes' AS total_size,
          COALESCE(assignments.assigned_role_names, ARRAY[]::text[]) AS assigned_role_names,
          COALESCE(array_length(assignments.assigned_role_names, 1), 0)::int AS assigned_role_count
        FROM ${getQuotedProjectsTableRef()} projects
        LEFT JOIN pg_catalog.pg_namespace n
          ON n.nspname = projects.schema_name
        LEFT JOIN LATERAL (
          SELECT array_agg(assignments.role_name ORDER BY assignments.role_name) AS assigned_role_names
          FROM ${getQuotedProjectRoleAssignmentsTableRef()} assignments
          WHERE assignments.project_id = projects.id
        ) assignments ON TRUE
        WHERE projects.id = $1
        LIMIT 1
      `
        : `
        SELECT
          projects.id,
          projects.project_ref,
          projects.name,
          projects.schema_name,
          projects.description,
          projects.status,
          projects.created_at::text,
          projects.updated_at::text,
          projects.creator_role_name,
          COALESCE(pg_catalog.pg_get_userbyid(n.nspowner), 'unknown') AS owner,
          COUNT(DISTINCT c.oid) FILTER (
            WHERE c.relkind IN ('r', 'v', 'm', 'p') AND c.relname NOT LIKE 'pg_%'
          )::int AS table_count,
          COALESCE(pg_catalog.pg_size_pretty(SUM(pg_total_relation_size(c.oid))), '0 bytes') AS total_size,
          COALESCE(assignments.assigned_role_names, ARRAY[]::text[]) AS assigned_role_names,
          COALESCE(array_length(assignments.assigned_role_names, 1), 0)::int AS assigned_role_count
        FROM ${getQuotedProjectsTableRef()} projects
        LEFT JOIN pg_catalog.pg_namespace n
          ON n.nspname = projects.schema_name
        LEFT JOIN pg_catalog.pg_class c
          ON c.relnamespace = n.oid
          AND c.relkind IN ('r', 'v', 'm', 'p')
          AND c.relname NOT LIKE 'pg_%'
          AND c.relname NOT LIKE 'sql_%'
        LEFT JOIN LATERAL (
          SELECT array_agg(assignments.role_name ORDER BY assignments.role_name) AS assigned_role_names
          FROM ${getQuotedProjectRoleAssignmentsTableRef()} assignments
          WHERE assignments.project_id = projects.id
        ) assignments ON TRUE
        WHERE projects.id = $1
        GROUP BY
          projects.id,
          projects.project_ref,
          projects.name,
          projects.schema_name,
          projects.description,
          projects.status,
          projects.created_at,
          projects.updated_at,
          projects.creator_role_name,
          n.nspowner,
          assignments.assigned_role_names
        LIMIT 1
      `,
      [projectRecord.id]
    )

    const project = result.rows[0] ?? null
    if (
      !project ||
      !(await canPrincipalAccessSchema(client, auth.session, project.schema_name))
    ) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      )
    }

    const principalRoleName = getPrincipalRoleName(auth.session)

    return NextResponse.json({
      success: true,
      project: {
        ...project,
        can_manage: canPrincipalManageProject(auth.session, project.creator_role_name),
        is_creator: isProjectCreator(project.creator_role_name, principalRoleName),
        current_role_name: principalRoleName,
      },
    })
  } catch (error) {
    console.error("Error fetching project detail:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to fetch project detail") },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}

export async function PATCH(
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
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    )
  }

  const nameProvided = Object.prototype.hasOwnProperty.call(body, "name")
  const projectName = readProjectName(body.name)
  const descriptionProvided = Object.prototype.hasOwnProperty.call(body, "description")
  const description = readDescription(body.description)
  const assignedRoleNamesProvided = Object.prototype.hasOwnProperty.call(
    body,
    "assigned_role_names"
  )
  const assignedRoleNames = readRoleNames(body.assigned_role_names)

  if (nameProvided && projectName === null) {
    return NextResponse.json(
      { success: false, error: "Enter a valid project name." },
      { status: 400 }
    )
  }
  if (descriptionProvided && description === undefined) {
    return NextResponse.json(
      { success: false, error: "Enter a valid description." },
      { status: 400 }
    )
  }
  if (assignedRoleNamesProvided && assignedRoleNames === null) {
    return NextResponse.json(
      { success: false, error: "Enter valid PostgreSQL users to assign." },
      { status: 400 }
    )
  }

  if (!nameProvided && !descriptionProvided && !assignedRoleNamesProvided) {
    return NextResponse.json(
      { success: false, error: "No project changes were provided." },
      { status: 400 }
    )
  }

  const client = await getPool().connect()
  let inTransaction = false
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
        { success: false, error: "Only the project creator can update settings" },
        { status: 403 }
      )
    }

    const creatorRoleName = project.creator_role_name ?? getPrincipalRoleName(auth.session)
    const previousAssignedRoleNames = await listProjectRoleAssignments(client, project.id)
    const nextRequestedRoleNames = assignedRoleNamesProvided
      ? assignedRoleNames ?? []
      : previousAssignedRoleNames

    if (assignedRoleNamesProvided) {
      const missingRoles = await listMissingPostgresRoleNames(client, nextRequestedRoleNames)
      if (missingRoles.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `These PostgreSQL roles were not found: ${missingRoles.join(", ")}`,
          },
          { status: 400 }
        )
      }
    }

    await client.query("BEGIN")
    inTransaction = true

    if (nameProvided || descriptionProvided) {
      await renameProjectRecord(client, project.schema_name, {
        schemaName: project.schema_name,
        name: nameProvided ? projectName ?? project.name : undefined,
        description: descriptionProvided ? description : undefined,
      })
    }

    let nextAssignedRoleNames = previousAssignedRoleNames
    if (assignedRoleNamesProvided) {
      const previousEffectiveAssignees = await listEffectiveProjectAssignees(
        client,
        project.id,
        creatorRoleName
      )
      const previousEffectiveLower = new Set(
        previousEffectiveAssignees.map((name) => name.toLowerCase())
      )
      const nextLower = new Set(nextRequestedRoleNames.map((name) => name.toLowerCase()))
      const addedUsernames = nextRequestedRoleNames.filter(
        (name) => !previousEffectiveLower.has(name.toLowerCase())
      )
      const removedUsernames = previousEffectiveAssignees.filter(
        (name) => !nextLower.has(name.toLowerCase())
      )

      nextAssignedRoleNames = await replaceProjectRoleAssignments(
        client,
        project.id,
        nextRequestedRoleNames,
        creatorRoleName
      )

      const { syncPgUserToProjectTeams } = await import("@/lib/project-team-sync")
      for (const username of removedUsernames) {
        if (creatorRoleName && username.toLowerCase() === creatorRoleName.toLowerCase()) {
          continue
        }
        await syncPgUserToProjectTeams(client, project.id, username, false)
      }

      await syncProjectRoleSchemaAccess(
        client,
        project.schema_name,
        previousEffectiveAssignees,
        nextAssignedRoleNames
      )

      for (const username of addedUsernames) {
        await syncPgUserToProjectTeams(client, project.id, username, true)
      }
    }

    await client.query("COMMIT")
    inTransaction = false

    const updatedProject = await getProjectRecordById(client, project.id)
    const principalRoleName = getPrincipalRoleName(auth.session)

    return NextResponse.json({
      success: true,
      message: "Project settings updated successfully",
      project: updatedProject
        ? {
            ...updatedProject,
            assigned_role_names: nextAssignedRoleNames,
            assigned_role_count: nextAssignedRoleNames.length,
            can_manage: true,
            is_creator: isProjectCreator(
              updatedProject.creator_role_name,
              principalRoleName
            ),
            current_role_name: principalRoleName,
          }
        : null,
    })
  } catch (error) {
    if (inTransaction) {
      await client.query("ROLLBACK")
    }
    console.error("Error updating project:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to update project") },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}

export async function DELETE(
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
  let inTransaction = false
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

    const principalRoleName = getPrincipalRoleName(auth.session)
    if (!isProjectCreator(project.creator_role_name, principalRoleName)) {
      return NextResponse.json(
        { success: false, error: "Only the project creator can delete this project" },
        { status: 403 }
      )
    }

    const previousAssignedRoleNames = await listProjectRoleAssignments(client, project.id)

    await client.query("BEGIN")
    inTransaction = true

    if (previousAssignedRoleNames.length > 0) {
      await syncProjectRoleSchemaAccess(client, project.schema_name, previousAssignedRoleNames, [])
    }
    await removeProjectRecord(client, project.schema_name)

    await client.query("COMMIT")
    inTransaction = false

    return NextResponse.json({
      success: true,
      message: `Project ${project.name} deleted successfully`,
      project,
    })
  } catch (error) {
    if (inTransaction) {
      await client.query("ROLLBACK")
    }
    console.error("Error deleting project:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to delete project") },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
