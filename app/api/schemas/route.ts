import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRequest } from "@/lib/auth/session"
import { getPool } from '@/lib/db'
import {
  getControlSchema,
  isSafePgIdentifier,
  quotePgIdentifier,
} from "@/lib/control-schema"
import {
  assignSchemaOwner,
  canAccessSchema,
  ensureSchemaAccessTable,
  getQuotedSchemaAccessTableRef,
  getSuperadminById,
  removeSchemaOwnerRecord,
  renameSchemaOwnerRecord,
} from "@/lib/schema-access"
import {
  ensureProjectsTable,
  removeProjectRecord,
  renameProjectRecord,
  upsertProjectRecord,
} from "@/lib/projects"
import { getQuotedProjectsTableRef } from "@/lib/control-schema"

function readOptionalSuperadminId(value: unknown): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === "") return null
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value)
  return undefined
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

// GET - Fetch all schemas
export async function GET(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  try {
    const client = await getPool().connect()
    
    try {
      await ensureSchemaAccessTable(client)
      await ensureProjectsTable(client)

      // Improved query to get all schemas with accurate table counts
      const query = `
        SELECT 
          n.nspname as schema_name,
          projects.name as project_name,
          COALESCE(pg_catalog.pg_get_userbyid(n.nspowner), 'unknown') as owner,
          COUNT(DISTINCT c.oid) FILTER (WHERE c.relkind IN ('r', 'v', 'm', 'p') AND c.relname NOT LIKE 'pg_%') as table_count,
          COALESCE(pg_catalog.pg_size_pretty(SUM(pg_total_relation_size(c.oid))), '0 bytes') as total_size,
          pg_catalog.obj_description(n.oid) as description,
          n.nspowner as owner_id,
          access_map.superadmin_id as owner_superadmin_id,
          owner_user.email as owner_superadmin_email
        FROM pg_catalog.pg_namespace n
        LEFT JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid 
          AND c.relkind IN ('r', 'v', 'm', 'p')
          AND c.relname NOT LIKE 'pg_%'
          AND c.relname NOT LIKE 'sql_%'
        LEFT JOIN ${getQuotedProjectsTableRef()} projects
          ON projects.schema_name = n.nspname
        LEFT JOIN ${getQuotedSchemaAccessTableRef()} access_map
          ON access_map.schema_name = n.nspname
        LEFT JOIN ${quotePgIdentifier(getControlSchema())}.${quotePgIdentifier("superadmin")} owner_user
          ON owner_user.id = access_map.superadmin_id
        WHERE n.nspname NOT LIKE 'pg_%'
          AND n.nspname != 'information_schema'
          AND n.nspname NOT LIKE '%backup%'
          AND (access_map.superadmin_id IS NULL OR access_map.superadmin_id = $1)
        GROUP BY n.nspname, projects.name, n.nspowner, n.oid, access_map.superadmin_id, owner_user.email
        ORDER BY n.nspname
      `
      
      const result = await client.query(query, [auth.session.id])
      client.release()
      
      return NextResponse.json({
        success: true,
        schemas: result.rows,
        count: result.rows.length,
        controlSchema: getControlSchema(),
      })
      
    } catch (error) {
      client.release()
      throw error
    }
    
  } catch (error) {
    console.error('Database error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch schemas' },
      { status: 500 }
    )
  }
}

// POST - Create a new schema
export async function POST(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const { schema_name, owner, description } = body
    const projectName =
      typeof (body as { project_name?: unknown }).project_name === "string"
        ? (body as { project_name: string }).project_name.trim()
        : ""
    const ownerSuperadminId = readOptionalSuperadminId(
      (body as { owner_superadmin_id?: unknown }).owner_superadmin_id
    )

    if (typeof schema_name !== "string" || !isSafePgIdentifier(schema_name.trim())) {
      return NextResponse.json(
        { success: false, error: 'Enter a valid schema name.' },
        { status: 400 }
      )
    }
    if ((body as { owner_superadmin_id?: unknown }).owner_superadmin_id !== undefined && ownerSuperadminId === undefined) {
      return NextResponse.json(
        { success: false, error: 'Enter a valid superadmin owner.' },
        { status: 400 }
      )
    }
    if (
      (body as { project_name?: unknown }).project_name !== undefined &&
      (!projectName || projectName.length > 255)
    ) {
      return NextResponse.json(
        { success: false, error: 'Enter a valid project name.' },
        { status: 400 }
      )
    }

    const normalizedSchemaName = schema_name.trim()

    const client = await getPool().connect()
    let inTransaction = false
    
    try {
      await ensureSchemaAccessTable(client)
      await ensureProjectsTable(client)

      const schemaExists = await client.query<{ exists: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1
            FROM pg_catalog.pg_namespace
            WHERE nspname = $1
          ) AS exists
        `,
        [normalizedSchemaName]
      )

      if (schemaExists.rows[0]?.exists) {
        client.release()
        return NextResponse.json(
          { success: false, error: `Schema "${normalizedSchemaName}" already exists.` },
          { status: 409 }
        )
      }

      let ownerSuperadmin = null
      if (ownerSuperadminId !== undefined && ownerSuperadminId !== null) {
        ownerSuperadmin = await getSuperadminById(client, ownerSuperadminId)
        if (!ownerSuperadmin) {
          client.release()
          return NextResponse.json(
            { success: false, error: 'Selected superadmin was not found.' },
            { status: 400 }
          )
        }
      }

      await client.query('BEGIN')
      inTransaction = true
      
      // Create schema
      const createSchemaQuery = `CREATE SCHEMA ${quotePgIdentifier(normalizedSchemaName)}`
      await client.query(createSchemaQuery)
      
      // Set owner if specified and not postgres
      if (owner && owner !== 'postgres' && owner !== 'pg_database_owner') {
        try {
          await client.query(
            `ALTER SCHEMA ${quotePgIdentifier(normalizedSchemaName)} OWNER TO ${quotePgIdentifier(String(owner))}`
          )
        } catch {
          console.log('Could not change owner, continuing...')
        }
      }
      
      // Set comment/description if provided
      if (description) {
        await client.query(
          `COMMENT ON SCHEMA ${quotePgIdentifier(normalizedSchemaName)} IS '${String(description).replace(/'/g, "''")}'`
        )
      }

      if (ownerSuperadminId !== undefined) {
        await assignSchemaOwner(client, normalizedSchemaName, ownerSuperadminId ?? null)
      }
      if (projectName) {
        await upsertProjectRecord(client, {
          name: projectName,
          schemaName: normalizedSchemaName,
          description: typeof description === "string" ? description : null,
          ownerSuperadminId: ownerSuperadminId ?? null,
        })
      }
      
      await client.query('COMMIT')
      inTransaction = false
      client.release()
      
      return NextResponse.json({
        success: true,
        message: `Schema ${normalizedSchemaName} created successfully`,
        schema_name: normalizedSchemaName,
        owner_superadmin_id: ownerSuperadminId ?? null,
        owner_superadmin_email: ownerSuperadmin?.email ?? null,
      })
      
    } catch (error) {
      if (inTransaction) {
        await client.query('ROLLBACK')
      }
      client.release()
      throw error
    }
    
  } catch (error: unknown) {
    console.error('Error creating schema:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error, 'Failed to create schema') },
      { status: 500 }
    )
  }
}

// PUT - Update schema (rename or change owner)
export async function PUT(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const { old_name, new_name, owner, description } = body
    const projectNameProvided = Object.prototype.hasOwnProperty.call(body, "project_name")
    const projectName =
      typeof (body as { project_name?: unknown }).project_name === "string"
        ? (body as { project_name: string }).project_name.trim()
        : undefined
    const ownerSuperadminProvided = Object.prototype.hasOwnProperty.call(body, "owner_superadmin_id")
    const ownerSuperadminId = readOptionalSuperadminId(
      (body as { owner_superadmin_id?: unknown }).owner_superadmin_id
    )

    if (typeof old_name !== "string" || !isSafePgIdentifier(old_name.trim())) {
      return NextResponse.json(
        { success: false, error: 'Current schema name is required.' },
        { status: 400 }
      )
    }
    if (new_name && (typeof new_name !== "string" || !isSafePgIdentifier(new_name.trim()))) {
      return NextResponse.json(
        { success: false, error: 'Enter a valid new schema name.' },
        { status: 400 }
      )
    }
    if (ownerSuperadminProvided && ownerSuperadminId === undefined) {
      return NextResponse.json(
        { success: false, error: 'Enter a valid superadmin owner.' },
        { status: 400 }
      )
    }
    if (projectNameProvided && (!projectName || projectName.length > 255)) {
      return NextResponse.json(
        { success: false, error: 'Enter a valid project name.' },
        { status: 400 }
      )
    }

    const oldSchemaName = old_name.trim()
    const nextSchemaName = typeof new_name === "string" && new_name.trim() ? new_name.trim() : oldSchemaName

    const client = await getPool().connect()
    let inTransaction = false
    
    try {
      if (!(await canAccessSchema(client, auth.session.id, oldSchemaName))) {
        client.release()
        return NextResponse.json(
          { success: false, error: "You do not have access to this schema." },
          { status: 403 }
        )
      }

      await ensureSchemaAccessTable(client)
      await ensureProjectsTable(client)
      
      if (nextSchemaName !== oldSchemaName) {
        const schemaExists = await client.query<{ exists: boolean }>(
          `
            SELECT EXISTS (
              SELECT 1
              FROM pg_catalog.pg_namespace
              WHERE nspname = $1
            ) AS exists
          `,
          [nextSchemaName]
        )

        if (schemaExists.rows[0]?.exists) {
          client.release()
          return NextResponse.json(
            { success: false, error: `Schema "${nextSchemaName}" already exists.` },
            { status: 409 }
          )
        }
      }

      if (ownerSuperadminProvided && ownerSuperadminId !== null) {
        const ownerSuperadmin = await getSuperadminById(client, ownerSuperadminId!)
        if (!ownerSuperadmin) {
          client.release()
          return NextResponse.json(
            { success: false, error: 'Selected superadmin was not found.' },
            { status: 400 }
          )
        }
      }

      await client.query('BEGIN')
      inTransaction = true
      
      // Rename schema if new name provided
      if (nextSchemaName !== oldSchemaName) {
        await client.query(
          `ALTER SCHEMA ${quotePgIdentifier(oldSchemaName)} RENAME TO ${quotePgIdentifier(nextSchemaName)}`
        )
        await renameSchemaOwnerRecord(client, oldSchemaName, nextSchemaName)
      }
      
      // Change owner if specified
      if (owner && owner !== 'pg_database_owner') {
        try {
          await client.query(
            `ALTER SCHEMA ${quotePgIdentifier(nextSchemaName)} OWNER TO ${quotePgIdentifier(String(owner))}`
          )
        } catch {
          console.log('Could not change owner, continuing...')
        }
      }
      
      // Update comment/description if provided
      if (description !== undefined) {
        if (description) {
          await client.query(
            `COMMENT ON SCHEMA ${quotePgIdentifier(nextSchemaName)} IS '${String(description).replace(/'/g, "''")}'`
          )
        } else {
          await client.query(`COMMENT ON SCHEMA ${quotePgIdentifier(nextSchemaName)} IS NULL`)
        }
      }

      if (ownerSuperadminProvided) {
        await assignSchemaOwner(client, nextSchemaName, ownerSuperadminId ?? null)
      }
      await renameProjectRecord(client, oldSchemaName, {
        schemaName: nextSchemaName,
        name: projectNameProvided ? projectName : undefined,
        description: description !== undefined ? (description ? String(description) : null) : undefined,
        ownerSuperadminId: ownerSuperadminProvided ? ownerSuperadminId ?? null : undefined,
      })
      
      await client.query('COMMIT')
      inTransaction = false
      client.release()
      
      return NextResponse.json({
        success: true,
        message: `Schema ${nextSchemaName} updated successfully`
      })
      
    } catch (error) {
      if (inTransaction) {
        await client.query('ROLLBACK')
      }
      client.release()
      throw error
    }
    
  } catch (error: unknown) {
    console.error('Error updating schema:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error, 'Failed to update schema') },
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
    const schema_name = searchParams.get('schema_name')
    const cascade = searchParams.get('cascade') === 'true'

    if (!schema_name || !isSafePgIdentifier(schema_name)) {
      return NextResponse.json(
        { success: false, error: 'Schema name is required' },
        { status: 400 }
      )
    }

    const client = await getPool().connect()
    let inTransaction = false
    
    try {
      if (!(await canAccessSchema(client, auth.session.id, schema_name))) {
        client.release()
        return NextResponse.json(
          { success: false, error: "You do not have access to this schema." },
          { status: 403 }
        )
      }

      await client.query("BEGIN")
      inTransaction = true
      const deleteQuery = cascade 
        ? `DROP SCHEMA IF EXISTS ${quotePgIdentifier(schema_name)} CASCADE`
        : `DROP SCHEMA IF EXISTS ${quotePgIdentifier(schema_name)} RESTRICT`
      
      await client.query(deleteQuery)
      await removeSchemaOwnerRecord(client, schema_name)
      await removeProjectRecord(client, schema_name)
      await client.query("COMMIT")
      inTransaction = false
      client.release()
      
      return NextResponse.json({
        success: true,
        message: `Schema ${schema_name} deleted successfully`
      })
      
    } catch (error) {
      if (inTransaction) {
        await client.query("ROLLBACK")
      }
      client.release()
      throw error
    }
    
  } catch (error: unknown) {
    console.error('Error deleting schema:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error, 'Failed to delete schema') },
      { status: 500 }
    )
  }
}