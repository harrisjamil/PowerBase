import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ schemaName: string }> }
) {
  try {
    // Await the params promise
    const { schemaName } = await params
    console.log(`Fetching tables for schema: ${schemaName}`)
    
    const client = await pool.connect()
    
    try {
      // First, list all schemas to verify
      const allSchemas = await client.query(`
        SELECT nspname FROM pg_namespace 
        WHERE nspname NOT LIKE 'pg_%' 
        AND nspname != 'information_schema'
        ORDER BY nspname
      `)
      console.log('Available schemas:', allSchemas.rows.map(r => r.nspname))
      
      // Check if schema exists
      const schemaCheck = await client.query(
        'SELECT nspname FROM pg_namespace WHERE nspname = $1',
        [schemaName]
      )
      
      if (schemaCheck.rows.length === 0) {
        console.log(`Schema ${schemaName} not found`)
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
      console.log(`Found ${result.rows.length} tables in schema ${schemaName}:`, 
        result.rows.map(r => ({ name: r.table_name, type: r.table_type })))
      
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
      { success: false, error: 'Failed to fetch tables', details: error.message },
      { status: 500 }
    )
  }
}