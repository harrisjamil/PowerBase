import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRequest } from "@/lib/auth/session"
import { getPool } from '@/lib/db'

// GET - Fetch all schemas
export async function GET(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  try {
    const client = await getPool().connect()
    
    try {
      // Improved query to get all schemas with accurate table counts
      const query = `
        SELECT 
          n.nspname as schema_name,
          COALESCE(pg_catalog.pg_get_userbyid(n.nspowner), 'unknown') as owner,
          COUNT(DISTINCT c.oid) FILTER (WHERE c.relkind IN ('r', 'v', 'm', 'p') AND c.relname NOT LIKE 'pg_%') as table_count,
          COALESCE(pg_catalog.pg_size_pretty(SUM(pg_total_relation_size(c.oid))), '0 bytes') as total_size,
          pg_catalog.obj_description(n.oid) as description,
          n.nspowner as owner_id
        FROM pg_catalog.pg_namespace n
        LEFT JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid 
          AND c.relkind IN ('r', 'v', 'm', 'p')
          AND c.relname NOT LIKE 'pg_%'
          AND c.relname NOT LIKE 'sql_%'
        WHERE n.nspname NOT LIKE 'pg_%'
          AND n.nspname != 'information_schema'
          AND n.nspname NOT LIKE '%backup%'
        GROUP BY n.nspname, n.nspowner, n.oid
        ORDER BY n.nspname
      `
      
      const result = await client.query(query)
      client.release()
      
      return NextResponse.json({
        success: true,
        schemas: result.rows,
        count: result.rows.length
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

    if (!schema_name) {
      return NextResponse.json(
        { success: false, error: 'Schema name is required' },
        { status: 400 }
      )
    }

    const client = await getPool().connect()
    
    try {
      await client.query('BEGIN')
      
      // Create schema
      const createSchemaQuery = `CREATE SCHEMA IF NOT EXISTS "${schema_name}"`
      await client.query(createSchemaQuery)
      
      // Set owner if specified and not postgres
      if (owner && owner !== 'postgres' && owner !== 'pg_database_owner') {
        try {
          await client.query(`ALTER SCHEMA "${schema_name}" OWNER TO "${owner}"`)
        } catch (ownerError) {
          console.log('Could not change owner, continuing...')
        }
      }
      
      // Set comment/description if provided
      if (description) {
        await client.query(`COMMENT ON SCHEMA "${schema_name}" IS '${description.replace(/'/g, "''")}'`)
      }
      
      await client.query('COMMIT')
      client.release()
      
      return NextResponse.json({
        success: true,
        message: `Schema ${schema_name} created successfully`
      })
      
    } catch (error) {
      await client.query('ROLLBACK')
      client.release()
      throw error
    }
    
  } catch (error: any) {
    console.error('Error creating schema:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create schema' },
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

    if (!old_name) {
      return NextResponse.json(
        { success: false, error: 'Schema name is required' },
        { status: 400 }
      )
    }

    const client = await getPool().connect()
    
    try {
      await client.query('BEGIN')
      
      // Rename schema if new name provided
      if (new_name && new_name !== old_name) {
        await client.query(`ALTER SCHEMA "${old_name}" RENAME TO "${new_name}"`)
      }
      
      const schemaName = new_name || old_name
      
      // Change owner if specified
      if (owner && owner !== 'pg_database_owner') {
        try {
          await client.query(`ALTER SCHEMA "${schemaName}" OWNER TO "${owner}"`)
        } catch (ownerError) {
          console.log('Could not change owner, continuing...')
        }
      }
      
      // Update comment/description if provided
      if (description !== undefined) {
        if (description) {
          await client.query(`COMMENT ON SCHEMA "${schemaName}" IS '${description.replace(/'/g, "''")}'`)
        } else {
          await client.query(`COMMENT ON SCHEMA "${schemaName}" IS NULL`)
        }
      }
      
      await client.query('COMMIT')
      client.release()
      
      return NextResponse.json({
        success: true,
        message: `Schema ${schemaName} updated successfully`
      })
      
    } catch (error) {
      await client.query('ROLLBACK')
      client.release()
      throw error
    }
    
  } catch (error: any) {
    console.error('Error updating schema:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update schema' },
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

    if (!schema_name) {
      return NextResponse.json(
        { success: false, error: 'Schema name is required' },
        { status: 400 }
      )
    }

    const client = await getPool().connect()
    
    try {
      const deleteQuery = cascade 
        ? `DROP SCHEMA IF EXISTS "${schema_name}" CASCADE`
        : `DROP SCHEMA IF EXISTS "${schema_name}" RESTRICT`
      
      await client.query(deleteQuery)
      client.release()
      
      return NextResponse.json({
        success: true,
        message: `Schema ${schema_name} deleted successfully`
      })
      
    } catch (error) {
      client.release()
      throw error
    }
    
  } catch (error: any) {
    console.error('Error deleting schema:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete schema' },
      { status: 500 }
    )
  }
}