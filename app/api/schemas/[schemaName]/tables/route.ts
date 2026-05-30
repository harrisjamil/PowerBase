import { NextRequest, NextResponse } from 'next/server'
import { requirePrincipalRequest } from "@/lib/auth/principal-session"
import { getPool } from '@/lib/db'
import { isSafePgIdentifier, quotePgIdentifier } from "@/lib/control-schema"
import { canPrincipalAccessSchema } from "@/lib/principal-access"
import {
  validatePgColumnDefault,
  validatePgDataType,
} from "@/lib/security/pg-ddl"

type CreateTableColumn = {
  column_name: string
  data_type: string
  is_nullable?: boolean
  column_default?: string | null
  is_primary_key?: boolean
}

function invalidIdentifierResponse(label: string) {
  return NextResponse.json(
    { success: false, error: `Enter a valid ${label}.` },
    { status: 400 }
  )
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

// GET - Fetch all tables in a schema
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ schemaName: string }> }
) {
  const auth = requirePrincipalRequest(request)
  if (!auth.ok) return auth.response

  try {
    const { schemaName } = await params
    if (!isSafePgIdentifier(schemaName)) {
      return invalidIdentifierResponse("schema name")
    }
    console.log(`Fetching tables for schema: ${schemaName}`)
    
    const client = await getPool().connect()
    
    try {
      if (!(await canPrincipalAccessSchema(client, auth.session, schemaName))) {
        client.release()
        return NextResponse.json(
          { success: false, error: "You do not have access to this schema." },
          { status: 403 }
        )
      }

      // Check if schema exists
      const schemaCheck = await client.query(
        'SELECT nspname FROM pg_namespace WHERE nspname = $1',
        [schemaName]
      )
      
      if (schemaCheck.rows.length === 0) {
        console.log(`Schema ${schemaName} not found`)
        client.release()
        return NextResponse.json({
          success: true,
          tables: [],
          count: 0
        })
      }
      
      // Get all tables in the schema
      const query = `
        SELECT 
          c.relname as table_name,
          CASE c.relkind
            WHEN 'r' THEN 'BASE TABLE'
            WHEN 'v' THEN 'VIEW'
            WHEN 'm' THEN 'MATERIALIZED VIEW'
            WHEN 'p' THEN 'PARTITIONED TABLE'
            ELSE 'OTHER'
          END as table_type,
          COALESCE(pg_catalog.pg_stat_get_live_tuples(c.oid), 0) as row_count,
          COALESCE(pg_catalog.pg_size_pretty(pg_total_relation_size(c.oid)), '0 bytes') as table_size,
          pg_catalog.obj_description(c.oid) as description
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relkind IN ('r', 'v', 'm', 'p')
        ORDER BY c.relname
      `
      
      const result = await client.query(query, [schemaName])
      console.log(`Found ${result.rows.length} tables in schema ${schemaName}`)
      
      client.release()
      
      return NextResponse.json({
        success: true,
        tables: result.rows,
        count: result.rows.length
      })
      
    } catch (error) {
      client.release()
      throw error
    }
    
  } catch (error: unknown) {
    console.error('Database error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch tables', 
        details: getErrorMessage(error, 'Failed to fetch tables') 
      },
      { status: 500 }
    )
  }
}

// POST - Create a new table
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ schemaName: string }> }
) {
  const auth = requirePrincipalRequest(request)
  if (!auth.ok) return auth.response

  try {
    const { schemaName } = await params
    const body = (await request.json()) as {
      table_name?: unknown
      description?: unknown
      columns?: unknown
    }
    const table_name = typeof body.table_name === "string" ? body.table_name : ""
    const description = typeof body.description === "string" ? body.description : ""
    const columns = Array.isArray(body.columns) ? (body.columns as CreateTableColumn[]) : null

    if (!isSafePgIdentifier(schemaName)) {
      return invalidIdentifierResponse("schema name")
    }
    if (
      typeof table_name !== "string" ||
      !isSafePgIdentifier(table_name) ||
      !Array.isArray(columns) ||
      columns.length === 0 ||
      columns.some(
        (column) =>
          !column ||
          typeof column !== "object" ||
          !isSafePgIdentifier(String(column.column_name ?? "")) ||
          typeof column.data_type !== "string" ||
          !column.data_type.trim()
      )
    ) {
      return NextResponse.json(
        { success: false, error: 'Enter a valid table name and at least one valid column.' },
        { status: 400 }
      )
    }

    const client = await getPool().connect()
    let inTransaction = false
    
    try {
      if (!(await canPrincipalAccessSchema(client, auth.session, schemaName))) {
        client.release()
        return NextResponse.json(
          { success: false, error: "You do not have access to this schema." },
          { status: 403 }
        )
      }

      await client.query('BEGIN')
      inTransaction = true
      
      // Build CREATE TABLE statement
      let createTableSQL = `CREATE TABLE ${quotePgIdentifier(schemaName)}.${quotePgIdentifier(table_name)} (\n`
      
      const columnDefinitions = columns.map((col) => {
        const typeCheck = validatePgDataType(String(col.data_type))
        if (!typeCheck.ok) {
          throw new Error(typeCheck.error)
        }

        const defaultCheck = validatePgColumnDefault(
          typeof col.column_default === "string" ? col.column_default : null
        )
        if (!defaultCheck.ok) {
          throw new Error(defaultCheck.error)
        }

        let def = `  ${quotePgIdentifier(col.column_name)} ${typeCheck.sqlType}`

        if (!col.is_nullable) {
          def += ` NOT NULL`
        }

        if (defaultCheck.sqlDefault) {
          def += ` DEFAULT ${defaultCheck.sqlDefault}`
        }

        if (col.is_primary_key) {
          def += ` PRIMARY KEY`
        }

        return def
      })
      
      createTableSQL += columnDefinitions.join(',\n')
      createTableSQL += `\n)`
      
      console.log('Creating table with SQL:', createTableSQL)
      await client.query(createTableSQL)
      
      // Add comment if description provided - FIXED: escape the description string
      if (description && description.trim()) {
        // Escape single quotes in description
        const escapedDescription = description.replace(/'/g, "''")
        await client.query(
          `COMMENT ON TABLE ${quotePgIdentifier(schemaName)}.${quotePgIdentifier(table_name)} IS '${escapedDescription}'`
        )
      }
      
      await client.query('COMMIT')
      inTransaction = false
      client.release()
      
      return NextResponse.json({
        success: true,
        message: `Table ${table_name} created successfully`,
        table_name
      })
      
    } catch (error) {
      if (inTransaction) {
        await client.query('ROLLBACK')
      }
      client.release()
      throw error
    }
    
  } catch (error: unknown) {
    console.error('Error creating table:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error, 'Failed to create table') },
      { status: 500 }
    )
  }
}

// DELETE - Drop a table
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ schemaName: string }> }
) {
  const auth = requirePrincipalRequest(request)
  if (!auth.ok) return auth.response

  try {
    const { schemaName } = await params
    const { searchParams } = new URL(request.url)
    const table_name = searchParams.get('table_name')
    const cascade = searchParams.get('cascade') === 'true'

    if (!isSafePgIdentifier(schemaName)) {
      return invalidIdentifierResponse("schema name")
    }
    if (!table_name || !isSafePgIdentifier(table_name)) {
      return NextResponse.json(
        { success: false, error: 'Table name is required' },
        { status: 400 }
      )
    }

    const client = await getPool().connect()
    
    try {
      if (!(await canPrincipalAccessSchema(client, auth.session, schemaName))) {
        client.release()
        return NextResponse.json(
          { success: false, error: "You do not have access to this schema." },
          { status: 403 }
        )
      }

      const dropSQL = `DROP TABLE ${quotePgIdentifier(schemaName)}.${quotePgIdentifier(table_name)}${cascade ? ' CASCADE' : ''}`
      console.log('Deleting table with SQL:', dropSQL)
      await client.query(dropSQL)
      client.release()
      
      return NextResponse.json({
        success: true,
        message: `Table ${table_name} deleted successfully`
      })
      
    } catch (error) {
      client.release()
      throw error
    }
    
  } catch (error: unknown) {
    console.error('Error deleting table:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error, 'Failed to delete table') },
      { status: 500 }
    )
  }
}