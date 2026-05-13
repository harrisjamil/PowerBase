import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRequest } from "@/lib/auth/session"
import { getPool } from '@/lib/db'

// GET - Fetch all columns
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ schemaName: string; tableName: string }> }
) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  try {
    const { schemaName, tableName } = await params
    console.log(`Fetching columns for ${schemaName}.${tableName}`)
    
    const client = await getPool().connect()
    
    try {
      const query = `
        SELECT 
          a.attname as column_name,
          pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
          CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END as is_nullable,
          pg_catalog.pg_get_expr(d.adbin, d.adrelid) as column_default,
          CASE WHEN pk.contype = 'p' THEN true ELSE false END as is_primary_key,
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
    
  } catch (error: any) {
    console.error('Database error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch columns', details: error.message },
      { status: 500 }
    )
  }
}

// POST - Add a new column
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ schemaName: string; tableName: string }> }
) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  try {
    const { schemaName, tableName } = await params
    const body = await request.json()
    const { column_name, data_type, is_nullable, column_default } = body

    if (!column_name || !data_type) {
      return NextResponse.json(
        { success: false, error: 'Column name and data type are required' },
        { status: 400 }
      )
    }

    const client = await getPool().connect()
    
    try {
      let alterQuery = `ALTER TABLE "${schemaName}"."${tableName}" ADD COLUMN "${column_name}" ${data_type.toUpperCase()}`
      
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
    
  } catch (error: any) {
    console.error('Error adding column:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to add column' },
      { status: 500 }
    )
  }
}

// PUT - Update a column
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ schemaName: string; tableName: string }> }
) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  try {
    const { schemaName, tableName } = await params
    const body = await request.json()
    const { old_name, new_name, data_type, is_nullable, column_default } = body

    if (!old_name) {
      return NextResponse.json(
        { success: false, error: 'Column name is required' },
        { status: 400 }
      )
    }

    const client = await getPool().connect()
    
    try {
      await client.query('BEGIN')
      
      const currentColumnName = new_name || old_name
      
      // Rename column if name changed
      if (new_name && new_name !== old_name) {
        await client.query(`ALTER TABLE "${schemaName}"."${tableName}" RENAME COLUMN "${old_name}" TO "${new_name}"`)
      }
      
      // Change data type if provided
      if (data_type) {
        await client.query(`ALTER TABLE "${schemaName}"."${tableName}" ALTER COLUMN "${currentColumnName}" TYPE ${data_type.toUpperCase()}`)
      }
      
      // Change nullable constraint
      if (is_nullable !== undefined) {
        if (is_nullable === true) {
          await client.query(`ALTER TABLE "${schemaName}"."${tableName}" ALTER COLUMN "${currentColumnName}" DROP NOT NULL`)
        } else {
          await client.query(`ALTER TABLE "${schemaName}"."${tableName}" ALTER COLUMN "${currentColumnName}" SET NOT NULL`)
        }
      }
      
      // Change default value
      if (column_default !== undefined) {
        if (column_default && column_default !== '') {
          await client.query(`ALTER TABLE "${schemaName}"."${tableName}" ALTER COLUMN "${currentColumnName}" SET DEFAULT ${column_default}`)
        } else {
          await client.query(`ALTER TABLE "${schemaName}"."${tableName}" ALTER COLUMN "${currentColumnName}" DROP DEFAULT`)
        }
      }
      
      await client.query('COMMIT')
      client.release()
      
      return NextResponse.json({
        success: true,
        message: `Column updated successfully`
      })
      
    } catch (error) {
      await client.query('ROLLBACK')
      client.release()
      throw error
    }
    
  } catch (error: any) {
    console.error('Error updating column:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update column' },
      { status: 500 }
    )
  }
}

// DELETE - Delete a column
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ schemaName: string; tableName: string }> }
) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  try {
    const { schemaName, tableName } = await params
    const { searchParams } = new URL(request.url)
    const column_name = searchParams.get('column_name')

    if (!column_name) {
      return NextResponse.json(
        { success: false, error: 'Column name is required' },
        { status: 400 }
      )
    }

    const client = await getPool().connect()
    
    try {
      const dropSQL = `ALTER TABLE "${schemaName}"."${tableName}" DROP COLUMN "${column_name}"`
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
    
  } catch (error: any) {
    console.error('Error deleting column:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete column' },
      { status: 500 }
    )
  }
}