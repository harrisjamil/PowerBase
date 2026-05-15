import { NextRequest, NextResponse } from 'next/server'
import { requirePrincipalRequest } from "@/lib/auth/principal-session"
import { getPool } from '@/lib/db'
import { isSafePgIdentifier, quotePgIdentifier } from "@/lib/control-schema"
import { canPrincipalAccessSchema } from "@/lib/principal-access"

type ColumnMutationBody = {
  column_name?: unknown
  old_name?: unknown
  new_name?: unknown
  data_type?: unknown
  is_nullable?: unknown
  column_default?: unknown
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

// GET - Fetch all columns
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ schemaName: string; tableName: string }> }
) {
  const auth = requirePrincipalRequest(request)
  if (!auth.ok) return auth.response

  try {
    const { schemaName, tableName } = await params
    if (!isSafePgIdentifier(schemaName)) {
      return invalidIdentifierResponse("schema name")
    }
    if (!isSafePgIdentifier(tableName)) {
      return invalidIdentifierResponse("table name")
    }
    console.log(`Fetching columns for ${schemaName}.${tableName}`)
    
    const client = await getPool().connect()
    
    try {
      if (!(await canPrincipalAccessSchema(client, auth.session, schemaName))) {
        client.release()
        return NextResponse.json(
          { success: false, error: "You do not have access to this schema." },
          { status: 403 }
        )
      }

      const query = `
        SELECT 
          a.attname as column_name,
          pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
          CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END as is_nullable,
          pg_catalog.pg_get_expr(d.adbin, d.adrelid) as column_default,
          CASE WHEN pk.contype = 'p' THEN true ELSE false END as is_primary_key,
          CASE WHEN a.attidentity <> '' THEN true ELSE false END as is_identity,
          CASE WHEN a.attgenerated <> '' THEN true ELSE false END as is_generated,
          a.attnum as ordinal_position
        FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        LEFT JOIN pg_catalog.pg_constraint pk ON pk.conrelid = a.attrelid 
          AND pk.contype = 'p' 
          AND a.attnum = ANY(pk.conkey)
        WHERE n.nspname = $1
          AND c.relname = $2
          AND a.attnum > 0
          AND NOT a.attisdropped
        ORDER BY a.attnum
      `
      
      const result = await client.query(query, [schemaName, tableName])
      console.log(`Found ${result.rows.length} columns in table ${tableName}`)
      
      client.release()
      
      return NextResponse.json({
        success: true,
        columns: result.rows,
        count: result.rows.length
      })
      
    } catch (error) {
      client.release()
      throw error
    }
    
  } catch (error: unknown) {
    console.error('Database error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch columns', details: getErrorMessage(error, 'Failed to fetch columns') },
      { status: 500 }
    )
  }
}

// POST - Add a new column
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ schemaName: string; tableName: string }> }
) {
  const auth = requirePrincipalRequest(request)
  if (!auth.ok) return auth.response

  try {
    const { schemaName, tableName } = await params
    const body = (await request.json()) as ColumnMutationBody
    const column_name = typeof body.column_name === "string" ? body.column_name : ""
    const data_type = typeof body.data_type === "string" ? body.data_type : ""
    const is_nullable = body.is_nullable
    const column_default = typeof body.column_default === "string" ? body.column_default : body.column_default

    if (!isSafePgIdentifier(schemaName)) {
      return invalidIdentifierResponse("schema name")
    }
    if (!isSafePgIdentifier(tableName)) {
      return invalidIdentifierResponse("table name")
    }
    if (typeof column_name !== "string" || !isSafePgIdentifier(column_name) || !data_type) {
      return NextResponse.json(
        { success: false, error: 'Column name and data type are required' },
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

      let alterQuery = `ALTER TABLE ${quotePgIdentifier(schemaName)}.${quotePgIdentifier(tableName)} ADD COLUMN ${quotePgIdentifier(column_name)} ${String(data_type).toUpperCase()}`
      
      if (is_nullable === false) {
        alterQuery += ` NOT NULL`
      }
      
      if (column_default && column_default !== '') {
        alterQuery += ` DEFAULT ${column_default}`
      }
      
      console.log('Adding column with SQL:', alterQuery)
      await client.query(alterQuery)
      client.release()
      
      return NextResponse.json({
        success: true,
        message: `Column ${column_name} added successfully`
      })
      
    } catch (error) {
      client.release()
      throw error
    }
    
  } catch (error: unknown) {
    console.error('Error adding column:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error, 'Failed to add column') },
      { status: 500 }
    )
  }
}

// PUT - Update a column
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ schemaName: string; tableName: string }> }
) {
  const auth = requirePrincipalRequest(request)
  if (!auth.ok) return auth.response

  try {
    const { schemaName, tableName } = await params
    const body = (await request.json()) as ColumnMutationBody
    const old_name = typeof body.old_name === "string" ? body.old_name : ""
    const new_name = typeof body.new_name === "string" ? body.new_name : undefined
    const data_type = typeof body.data_type === "string" ? body.data_type : undefined
    const is_nullable = body.is_nullable
    const column_default =
      typeof body.column_default === "string" ? body.column_default : body.column_default

    if (!isSafePgIdentifier(schemaName)) {
      return invalidIdentifierResponse("schema name")
    }
    if (!isSafePgIdentifier(tableName)) {
      return invalidIdentifierResponse("table name")
    }
    if (typeof old_name !== "string" || !isSafePgIdentifier(old_name)) {
      return NextResponse.json(
        { success: false, error: 'Column name is required' },
        { status: 400 }
      )
    }
    if (new_name && (typeof new_name !== "string" || !isSafePgIdentifier(new_name))) {
      return invalidIdentifierResponse("column name")
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
      
      const currentColumnName = new_name || old_name
      
      // Rename column if name changed
      if (new_name && new_name !== old_name) {
        await client.query(
          `ALTER TABLE ${quotePgIdentifier(schemaName)}.${quotePgIdentifier(tableName)} RENAME COLUMN ${quotePgIdentifier(old_name)} TO ${quotePgIdentifier(new_name)}`
        )
      }
      
      // Change data type if provided
      if (data_type) {
        await client.query(
          `ALTER TABLE ${quotePgIdentifier(schemaName)}.${quotePgIdentifier(tableName)} ALTER COLUMN ${quotePgIdentifier(currentColumnName)} TYPE ${String(data_type).toUpperCase()}`
        )
      }
      
      // Change nullable constraint
      if (is_nullable !== undefined) {
        if (is_nullable === true) {
          await client.query(
            `ALTER TABLE ${quotePgIdentifier(schemaName)}.${quotePgIdentifier(tableName)} ALTER COLUMN ${quotePgIdentifier(currentColumnName)} DROP NOT NULL`
          )
        } else {
          await client.query(
            `ALTER TABLE ${quotePgIdentifier(schemaName)}.${quotePgIdentifier(tableName)} ALTER COLUMN ${quotePgIdentifier(currentColumnName)} SET NOT NULL`
          )
        }
      }
      
      // Change default value
      if (column_default !== undefined) {
        if (column_default && column_default !== '') {
          await client.query(
            `ALTER TABLE ${quotePgIdentifier(schemaName)}.${quotePgIdentifier(tableName)} ALTER COLUMN ${quotePgIdentifier(currentColumnName)} SET DEFAULT ${column_default}`
          )
        } else {
          await client.query(
            `ALTER TABLE ${quotePgIdentifier(schemaName)}.${quotePgIdentifier(tableName)} ALTER COLUMN ${quotePgIdentifier(currentColumnName)} DROP DEFAULT`
          )
        }
      }
      
      await client.query('COMMIT')
      inTransaction = false
      client.release()
      
      return NextResponse.json({
        success: true,
        message: `Column updated successfully`
      })
      
    } catch (error) {
      if (inTransaction) {
        await client.query('ROLLBACK')
      }
      client.release()
      throw error
    }
    
  } catch (error: unknown) {
    console.error('Error updating column:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error, 'Failed to update column') },
      { status: 500 }
    )
  }
}

// DELETE - Delete a column
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ schemaName: string; tableName: string }> }
) {
  const auth = requirePrincipalRequest(request)
  if (!auth.ok) return auth.response

  try {
    const { schemaName, tableName } = await params
    const { searchParams } = new URL(request.url)
    const column_name = searchParams.get('column_name')

    if (!isSafePgIdentifier(schemaName)) {
      return invalidIdentifierResponse("schema name")
    }
    if (!isSafePgIdentifier(tableName)) {
      return invalidIdentifierResponse("table name")
    }
    if (!column_name || !isSafePgIdentifier(column_name)) {
      return NextResponse.json(
        { success: false, error: 'Column name is required' },
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

      const dropSQL = `ALTER TABLE ${quotePgIdentifier(schemaName)}.${quotePgIdentifier(tableName)} DROP COLUMN ${quotePgIdentifier(column_name)}`
      console.log('Deleting column with SQL:', dropSQL)
      await client.query(dropSQL)
      client.release()
      
      return NextResponse.json({
        success: true,
        message: `Column ${column_name} deleted successfully`
      })
      
    } catch (error) {
      client.release()
      throw error
    }
    
  } catch (error: unknown) {
    console.error('Error deleting column:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error, 'Failed to delete column') },
      { status: 500 }
    )
  }
}