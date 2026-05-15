import { NextRequest, NextResponse } from "next/server"
import { requireAdminRequest } from "@/lib/auth/session"
import { requirePrincipalRequest } from "@/lib/auth/principal-session"
import { getPool } from "@/lib/db"
import { getQuotedProjectsTableRef } from "@/lib/control-schema"
import {
  ensureProjectRoleAssignmentsTable,
  ensureProjectsTable,
  getProjectRecordById,
  getQuotedProjectRoleAssignmentsTableRef,
  listProjectRoleAssignments,
  removeProjectRecord,
} from "@/lib/projects"
import { getAccessibleSchemaNamesForPrincipal } from "@/lib/principal-access"
import { syncProjectRoleSchemaAccess } from "@/lib/postgres-roles"

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

function readId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value)
  return null
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export async function GET(request: NextRequest) {
  const auth = requirePrincipalRequest(request)
  if (!auth.ok) return auth.response

  const client = await getPool().connect()
  try {
    await ensureProjectsTable(client)
    await ensureProjectRoleAssignmentsTable(client)

    const accessibleSchemas = await getAccessibleSchemaNamesForPrincipal(client, auth.session)
    const result = await client.query<ProjectRow>(
      `
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
        ORDER BY projects.created_at DESC, projects.id DESC
      `
    )

    const visibleProjects = result.rows.filter((project) =>
      accessibleSchemas.has(project.schema_name)
    )

    return NextResponse.json({
      success: true,
      projects: visibleProjects,
      count: visibleProjects.length,
    })
  } catch (error) {
    console.error("Error fetching projects:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to fetch projects") },
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
  const id = readId(searchParams.get("id"))
  if (!id) {
    return NextResponse.json(
      { success: false, error: "ID is required" },
      { status: 400 }
    )
  }

  const client = await getPool().connect()
  let inTransaction = false
  try {
    await ensureProjectsTable(client)
    await ensureProjectRoleAssignmentsTable(client)

    const project = await getProjectRecordById(client, id)
    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      )
    }
    if (project.creator_role_name && project.creator_role_name !== auth.session.email) {
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
