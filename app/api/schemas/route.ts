import { NextRequest, NextResponse } from "next/server"
import type { PoolClient } from "pg"
import { requireAdminRequest } from "@/lib/auth/session"
import { requirePrincipalRequest } from "@/lib/auth/principal-session"
import { getPool } from "@/lib/db"
import { buildProjectSchemaName } from "@/lib/project-names"
import {
  getControlSchema,
  getQuotedProjectsTableRef,
  isSafePgIdentifier,
  quotePgIdentifier,
} from "@/lib/control-schema"
import { getAccessibleSchemaNamesForPrincipal } from "@/lib/principal-access"
import {
  canRoleAccessProjectSchema,
  ensureProjectRoleAssignmentsTable,
  ensureProjectsTable,
  getProjectRecordBySchemaName,
  getQuotedProjectRoleAssignmentsTableRef,
  listProjectRoleAssignments,
  removeProjectRecord,
  renameProjectRecord,
  replaceProjectRoleAssignments,
  upsertProjectRecord,
} from "@/lib/projects"
import {
  listMissingPostgresRoleNames,
  readRoleNames,
  syncProjectRoleSchemaAccess,
} from "@/lib/postgres-roles"

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function readProjectName(value: unknown) {
  if (typeof value !== "string") return undefined
  const projectName = value.trim()
  if (!projectName || projectName.length > 255) {
    return null
  }
  return projectName
}

function readSchemaName(value: unknown) {
  if (typeof value !== "string") return null
  const schemaName = value.trim()
  if (!schemaName || !isSafePgIdentifier(schemaName)) {
    return null
  }
  return schemaName
}

function readOwnerRole(value: unknown) {
  if (typeof value !== "string") return undefined
  const owner = value.trim()
  return owner || undefined
}

function readDescription(value: unknown) {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== "string") return undefined
  const description = value.trim()
  return description || null
}

async function schemaExists(client: PoolClient, schemaName: string) {
  const result = await client.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_namespace
        WHERE nspname = $1
      ) AS exists
    `,
    [schemaName]
  )

  return Boolean(result.rows[0]?.exists)
}

async function canAdminAccessSchema(client: PoolClient, roleName: string, schemaName: string) {
  const project = await getProjectRecordBySchemaName(client, schemaName)
  if (!project) {
    return true
  }

  return canRoleAccessProjectSchema(client, roleName, schemaName)
}

// GET - Fetch all schemas
export async function GET(request: NextRequest) {
  const auth = requirePrincipalRequest(request)
  if (!auth.ok) return auth.response

  const client = await getPool().connect()
  try {
    await ensureProjectsTable(client)
    await ensureProjectRoleAssignmentsTable(client)
    const accessibleSchemas = await getAccessibleSchemaNamesForPrincipal(client, auth.session)

    const result = await client.query<{
      schema_name: string
      project_name: string | null
      owner: string
      table_count: number
      total_size: string
      description: string | null
      owner_id: number
      creator_role_name: string | null
      assigned_role_names: string[] | null
      assigned_role_count: number
    }>(
      `
        SELECT
          n.nspname AS schema_name,
          projects.id AS project_id,
          projects.project_ref,
          projects.name AS project_name,
          COALESCE(pg_catalog.pg_get_userbyid(n.nspowner), 'unknown') AS owner,
          COUNT(DISTINCT c.oid) FILTER (
            WHERE c.relkind IN ('r', 'v', 'm', 'p') AND c.relname NOT LIKE 'pg_%'
          )::int AS table_count,
          COALESCE(pg_catalog.pg_size_pretty(SUM(pg_total_relation_size(c.oid))), '0 bytes') AS total_size,
          pg_catalog.obj_description(n.oid) AS description,
          n.nspowner AS owner_id,
          projects.creator_role_name,
          COALESCE(assignments.assigned_role_names, ARRAY[]::text[]) AS assigned_role_names,
          COALESCE(array_length(assignments.assigned_role_names, 1), 0)::int AS assigned_role_count
        FROM pg_catalog.pg_namespace n
        LEFT JOIN pg_catalog.pg_class c
          ON c.relnamespace = n.oid
          AND c.relkind IN ('r', 'v', 'm', 'p')
          AND c.relname NOT LIKE 'pg_%'
          AND c.relname NOT LIKE 'sql_%'
        LEFT JOIN ${getQuotedProjectsTableRef()} projects
          ON projects.schema_name = n.nspname
        LEFT JOIN LATERAL (
          SELECT array_agg(assignments.role_name ORDER BY assignments.role_name) AS assigned_role_names
          FROM ${getQuotedProjectRoleAssignmentsTableRef()} assignments
          WHERE assignments.project_id = projects.id
        ) assignments ON TRUE
        WHERE n.nspname NOT LIKE 'pg_%'
          AND n.nspname <> 'information_schema'
          AND n.nspname NOT LIKE '%backup%'
        GROUP BY
          n.nspname,
          n.nspowner,
          n.oid,
          projects.id,
          projects.project_ref,
          projects.name,
          projects.creator_role_name,
          assignments.assigned_role_names
        ORDER BY n.nspname
      `
    )

    const visibleSchemas = result.rows.filter((schema) => accessibleSchemas.has(schema.schema_name))

    return NextResponse.json({
      success: true,
      schemas: visibleSchemas,
      count: visibleSchemas.length,
      controlSchema: getControlSchema(),
    })
  } catch (error) {
    console.error("Database error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch schemas" },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}

// POST - Create a new schema or a new project-backed schema
export async function POST(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  try {
    const body = (await request.json()) as Record<string, unknown>
    const owner = readOwnerRole(body.owner)
    const description = readDescription(body.description)
    const projectName = readProjectName(body.project_name)
    const assignedRoleNames = readRoleNames(body.assigned_role_names)
    const rawSchemaName = readSchemaName(body.schema_name)

    if (body.project_name !== undefined && projectName === null) {
      return NextResponse.json(
        { success: false, error: "Enter a valid project name." },
        { status: 400 }
      )
    }
    if (body.assigned_role_names !== undefined && assignedRoleNames === null) {
      return NextResponse.json(
        { success: false, error: "Enter valid PostgreSQL users to assign." },
        { status: 400 }
      )
    }
    if (!projectName && !rawSchemaName) {
      return NextResponse.json(
        { success: false, error: "Enter a valid schema name." },
        { status: 400 }
      )
    }
    if (!projectName && body.assigned_role_names !== undefined) {
      return NextResponse.json(
        { success: false, error: "PostgreSQL user assignment is only supported when creating a project." },
        { status: 400 }
      )
    }

    const normalizedSchemaName = projectName ? buildProjectSchemaName(projectName) : rawSchemaName
    if (!normalizedSchemaName || !isSafePgIdentifier(normalizedSchemaName)) {
      return NextResponse.json(
        { success: false, error: "Enter a valid schema name." },
        { status: 400 }
      )
    }

    const client = await getPool().connect()
    let inTransaction = false
    try {
      await ensureProjectsTable(client)
      await ensureProjectRoleAssignmentsTable(client)

      if (await schemaExists(client, normalizedSchemaName)) {
        return NextResponse.json(
          { success: false, error: `Schema "${normalizedSchemaName}" already exists.` },
          { status: 409 }
        )
      }

      const creatorRoleName = auth.session.email
      const missingRoles = await listMissingPostgresRoleNames(client, assignedRoleNames ?? [])
      if (missingRoles.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `These PostgreSQL roles were not found: ${missingRoles.join(", ")}`,
          },
          { status: 400 }
        )
      }

      await client.query("BEGIN")
      inTransaction = true

      await client.query(`CREATE SCHEMA ${quotePgIdentifier(normalizedSchemaName)}`)

      if (owner && owner !== "postgres" && owner !== "pg_database_owner") {
        try {
          await client.query(
            `ALTER SCHEMA ${quotePgIdentifier(normalizedSchemaName)} OWNER TO ${quotePgIdentifier(owner)}`
          )
        } catch {
          console.log("Could not change schema owner, continuing...")
        }
      }

      if (description) {
        await client.query(
          `COMMENT ON SCHEMA ${quotePgIdentifier(normalizedSchemaName)} IS '${description.replace(/'/g, "''")}'`
        )
      }

      let storedProject = null
      let nextAssignedRoleNames: string[] = []
      if (projectName) {
        storedProject = await upsertProjectRecord(client, {
          name: projectName,
          schemaName: normalizedSchemaName,
          description: description ?? null,
          ownerSuperadminId: null,
          creatorRoleName,
        })
        nextAssignedRoleNames = await replaceProjectRoleAssignments(
          client,
          storedProject.id,
          assignedRoleNames ?? [],
          creatorRoleName
        )
        await syncProjectRoleSchemaAccess(client, normalizedSchemaName, [], nextAssignedRoleNames)
      }

      await client.query("COMMIT")
      inTransaction = false

      return NextResponse.json({
        success: true,
        message: `Schema ${normalizedSchemaName} created successfully`,
        schema_name: normalizedSchemaName,
        project_name: projectName ?? null,
        creator_role_name: projectName ? creatorRoleName : null,
        assigned_role_names: nextAssignedRoleNames,
        project_id: storedProject?.id ?? null,
        project_ref: storedProject?.project_ref ?? null,
      })
    } catch (error) {
      if (inTransaction) {
        await client.query("ROLLBACK")
      }
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error("Error creating schema:", error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error, "Failed to create schema") },
      { status: 500 }
    )
  }
}

// PUT - Update schema or project-backed schema
export async function PUT(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  try {
    const body = (await request.json()) as Record<string, unknown>
    const oldSchemaName = readSchemaName(body.old_name)
    const explicitNewSchemaName =
      body.new_name === undefined ? undefined : readSchemaName(body.new_name)
    const owner = readOwnerRole(body.owner)
    const description = readDescription(body.description)
    const projectNameProvided = Object.prototype.hasOwnProperty.call(body, "project_name")
    const projectName = readProjectName(body.project_name)
    const assignedRoleNamesProvided = Object.prototype.hasOwnProperty.call(body, "assigned_role_names")
    const assignedRoleNames = readRoleNames(body.assigned_role_names)

    if (!oldSchemaName) {
      return NextResponse.json(
        { success: false, error: "Current schema name is required." },
        { status: 400 }
      )
    }
    if (body.new_name !== undefined && !explicitNewSchemaName) {
      return NextResponse.json(
        { success: false, error: "Enter a valid new schema name." },
        { status: 400 }
      )
    }
    if (projectNameProvided && projectName === null) {
      return NextResponse.json(
        { success: false, error: "Enter a valid project name." },
        { status: 400 }
      )
    }
    if (assignedRoleNamesProvided && assignedRoleNames === null) {
      return NextResponse.json(
        { success: false, error: "Enter valid PostgreSQL users to assign." },
        { status: 400 }
      )
    }

    const nextSchemaName = projectNameProvided
      ? buildProjectSchemaName(projectName ?? "")
      : explicitNewSchemaName ?? oldSchemaName

    if (!nextSchemaName || !isSafePgIdentifier(nextSchemaName)) {
      return NextResponse.json(
        { success: false, error: "Enter a valid schema name." },
        { status: 400 }
      )
    }

    const client = await getPool().connect()
    let inTransaction = false
    try {
      await ensureProjectsTable(client)
      await ensureProjectRoleAssignmentsTable(client)

      const existingProject = await getProjectRecordBySchemaName(client, oldSchemaName)
      if (!(await canAdminAccessSchema(client, auth.session.email, oldSchemaName))) {
        return NextResponse.json(
          { success: false, error: "You do not have access to this schema." },
          { status: 403 }
        )
      }

      if (nextSchemaName !== oldSchemaName && (await schemaExists(client, nextSchemaName))) {
        return NextResponse.json(
          { success: false, error: `Schema "${nextSchemaName}" already exists.` },
          { status: 409 }
        )
      }

      const creatorRoleName = existingProject?.creator_role_name ?? auth.session.email
      const previousAssignedRoleNames = existingProject
        ? await listProjectRoleAssignments(client, existingProject.id)
        : []
      const nextRequestedRoleNames =
        assignedRoleNamesProvided ? assignedRoleNames ?? [] : previousAssignedRoleNames
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

      await client.query("BEGIN")
      inTransaction = true

      if (nextSchemaName !== oldSchemaName) {
        await client.query(
          `ALTER SCHEMA ${quotePgIdentifier(oldSchemaName)} RENAME TO ${quotePgIdentifier(nextSchemaName)}`
        )
      }

      if (owner && owner !== "pg_database_owner") {
        try {
          await client.query(
            `ALTER SCHEMA ${quotePgIdentifier(nextSchemaName)} OWNER TO ${quotePgIdentifier(owner)}`
          )
        } catch {
          console.log("Could not change schema owner, continuing...")
        }
      }

      if (description !== undefined) {
        if (description) {
          await client.query(
            `COMMENT ON SCHEMA ${quotePgIdentifier(nextSchemaName)} IS '${description.replace(/'/g, "''")}'`
          )
        } else {
          await client.query(`COMMENT ON SCHEMA ${quotePgIdentifier(nextSchemaName)} IS NULL`)
        }
      }

      let nextAssignedRoleNames = previousAssignedRoleNames
      let storedProject = existingProject

      if (existingProject) {
        await renameProjectRecord(client, oldSchemaName, {
          schemaName: nextSchemaName,
          name: projectNameProvided ? projectName ?? existingProject.name : undefined,
          description: description !== undefined ? description : undefined,
          ownerSuperadminId: undefined,
          creatorRoleName,
        })
        storedProject = await getProjectRecordBySchemaName(client, nextSchemaName)
      } else if (projectNameProvided && projectName) {
        storedProject = await upsertProjectRecord(client, {
          name: projectName,
          schemaName: nextSchemaName,
          description: description ?? null,
          ownerSuperadminId: null,
          creatorRoleName,
        })
      }

      if (storedProject) {
        nextAssignedRoleNames = await replaceProjectRoleAssignments(
          client,
          storedProject.id,
          nextRequestedRoleNames,
          creatorRoleName
        )
        await syncProjectRoleSchemaAccess(
          client,
          nextSchemaName,
          previousAssignedRoleNames,
          nextAssignedRoleNames
        )
      }

      await client.query("COMMIT")
      inTransaction = false

      return NextResponse.json({
        success: true,
        message: `Schema ${nextSchemaName} updated successfully`,
        schema_name: nextSchemaName,
        project_id: storedProject?.id ?? null,
        project_ref: storedProject?.project_ref ?? null,
        creator_role_name: storedProject?.creator_role_name ?? null,
        assigned_role_names: nextAssignedRoleNames,
      })
    } catch (error) {
      if (inTransaction) {
        await client.query("ROLLBACK")
      }
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error("Error updating schema:", error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error, "Failed to update schema") },
      { status: 500 }
    )
  }
}

// DELETE - Delete a schema
export async function DELETE(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    const schemaName = searchParams.get("schema_name")
    const cascade = searchParams.get("cascade") === "true"

    if (!schemaName || !isSafePgIdentifier(schemaName)) {
      return NextResponse.json(
        { success: false, error: "Schema name is required" },
        { status: 400 }
      )
    }

    const client = await getPool().connect()
    let inTransaction = false
    try {
      await ensureProjectsTable(client)
      await ensureProjectRoleAssignmentsTable(client)

      const project = await getProjectRecordBySchemaName(client, schemaName)
      if (!(await canAdminAccessSchema(client, auth.session.email, schemaName))) {
        return NextResponse.json(
          { success: false, error: "You do not have access to this schema." },
          { status: 403 }
        )
      }

      const previousAssignedRoleNames = project
        ? await listProjectRoleAssignments(client, project.id)
        : []

      await client.query("BEGIN")
      inTransaction = true

      if (project && previousAssignedRoleNames.length > 0) {
        await syncProjectRoleSchemaAccess(client, schemaName, previousAssignedRoleNames, [])
      }

      const deleteQuery = cascade
        ? `DROP SCHEMA IF EXISTS ${quotePgIdentifier(schemaName)} CASCADE`
        : `DROP SCHEMA IF EXISTS ${quotePgIdentifier(schemaName)} RESTRICT`
      await client.query(deleteQuery)

      if (project) {
        await removeProjectRecord(client, schemaName)
      }

      await client.query("COMMIT")
      inTransaction = false

      return NextResponse.json({
        success: true,
        message: `Schema ${schemaName} deleted successfully`,
      })
    } catch (error) {
      if (inTransaction) {
        await client.query("ROLLBACK")
      }
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error("Error deleting schema:", error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error, "Failed to delete schema") },
      { status: 500 }
    )
  }
}
