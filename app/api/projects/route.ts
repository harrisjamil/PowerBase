import { NextRequest, NextResponse } from "next/server"
import { requireAdminRequest } from "@/lib/auth/session"
import { getPool } from "@/lib/db"
import { ensureProjectsTable } from "@/lib/projects"
import { getControlSchema, getQuotedProjectsTableRef, quotePgIdentifier } from "@/lib/control-schema"

type ProjectRow = {
  id: number
  name: string
  schema_name: string
  description: string | null
  status: string
  created_at: string | null
  updated_at: string | null
  owner_superadmin_id: number | null
  owner_superadmin_email: string | null
  owner: string | null
  table_count: number
  total_size: string
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
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  const client = await getPool().connect()
  try {
    await ensureProjectsTable(client)
    const result = await client.query<ProjectRow>(
      `
        SELECT
          projects.id,
          projects.name,
          projects.schema_name,
          projects.description,
          projects.status,
          projects.created_at::text,
          projects.updated_at::text,
          projects.owner_superadmin_id,
          owner_user.email AS owner_superadmin_email,
          COALESCE(pg_catalog.pg_get_userbyid(n.nspowner), 'unknown') AS owner,
          COUNT(DISTINCT c.oid) FILTER (WHERE c.relkind IN ('r', 'v', 'm', 'p') AND c.relname NOT LIKE 'pg_%')::int AS table_count,
          COALESCE(pg_catalog.pg_size_pretty(SUM(pg_total_relation_size(c.oid))), '0 bytes') AS total_size
        FROM ${getQuotedProjectsTableRef()} projects
        LEFT JOIN pg_catalog.pg_namespace n
          ON n.nspname = projects.schema_name
        LEFT JOIN pg_catalog.pg_class c
          ON c.relnamespace = n.oid
          AND c.relkind IN ('r', 'v', 'm', 'p')
          AND c.relname NOT LIKE 'pg_%'
          AND c.relname NOT LIKE 'sql_%'
        LEFT JOIN ${quotePgIdentifier(getControlSchema())}.${quotePgIdentifier("superadmin")} owner_user
          ON owner_user.id = projects.owner_superadmin_id
        WHERE projects.owner_superadmin_id IS NULL OR projects.owner_superadmin_id = $1
        GROUP BY
          projects.id,
          projects.name,
          projects.schema_name,
          projects.description,
          projects.status,
          projects.created_at,
          projects.updated_at,
          projects.owner_superadmin_id,
          owner_user.email,
          n.nspowner
        ORDER BY projects.created_at DESC, projects.id DESC
      `,
      [auth.session.id]
    )

    return NextResponse.json({
      success: true,
      projects: result.rows,
      count: result.rows.length,
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
  try {
    await ensureProjectsTable(client)

    const result = await client.query<{
      id: number
      name: string
      schema_name: string
      owner_superadmin_id: number | null
    }>(
      `
        DELETE FROM ${getQuotedProjectsTableRef()}
        WHERE id = $1
          AND (owner_superadmin_id IS NULL OR owner_superadmin_id = $2)
        RETURNING id, name, schema_name, owner_superadmin_id
      `,
      [id, auth.session.id]
    )

    if (result.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: "Project not found or not accessible" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Project ${result.rows[0].name} deleted successfully`,
      project: result.rows[0],
    })
  } catch (error) {
    console.error("Error deleting project:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to delete project") },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
