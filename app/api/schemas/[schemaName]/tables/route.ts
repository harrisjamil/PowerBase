import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRequest } from "@/lib/auth/session"
import { getPool } from '@/lib/db'

// GET - Fetch all tables in a schema
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ schemaName: string }> }
) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  try {
    const { schemaName } = await params
    console.log(`Fetching tables for schema: ${schemaName}`)
    
    const client = await getPool().connect()
    
    try {
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
    
  } catch (error: any) {
    console.error('Database error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch tables', 
        details: error.message 
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
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  try {
    const { schemaName } = await params
    const body = await request.json()
    const { table_name, description, columns } = body

    if (!table_name || !columns || columns.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Table name and at least one column are required' },
        { status: 400 }
      )
    }

    const client = await getPool().connect()
    
    try {
      await client.query('BEGIN')
      
      // Build CREATE TABLE statement
      let createTableSQL = `CREATE TABLE "${schemaName}"."${table_name}" (\n`
      
      const columnDefinitions = columns.map((col: any) => {
        let def = `  "${col.column_name}" ${col.data_type.toUpperCase()}`
        
        if (!col.is_nullable) {
          def += ` NOT NULL`
        }
        
        if (col.column_default && col.column_default !== '') {
          def += ` DEFAULT ${col.column_default}`
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
        await client.query(`COMMENT ON TABLE "${schemaName}"."${table_name}" IS '${escapedDescription}'`)
      }
      
      await client.query('COMMIT')
      client.release()
      
      return NextResponse.json({
        success: true,
        message: `Table ${table_name} created successfully`,
        table_name
      })
      
    } catch (error) {
      await client.query('ROLLBACK')
      client.release()
      throw error
    }
    
  } catch (error: any) {
    console.error('Error creating table:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create table' },
      { status: 500 }
    )
  }
}

// DELETE - Drop a table
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ schemaName: string }> }
) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  try {
    const { schemaName } = await params
    const { searchParams } = new URL(request.url)
    const table_name = searchParams.get('table_name')
    const cascade = searchParams.get('cascade') === 'true'

    if (!table_name) {
      return NextResponse.json(
        { success: false, error: 'Table name is required' },
        { status: 400 }
      )
    }

    const client = await getPool().connect()
    
    try {
      const dropSQL = `DROP TABLE "${schemaName}"."${table_name}"${cascade ? ' CASCADE' : ''}`
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
    
  } catch (error: any) {
    console.error('Error deleting table:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete table' },
      { status: 500 }
    )
  }
}