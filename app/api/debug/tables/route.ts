import { NextResponse } from 'next/server'
import { getAdminSessionFromRequest, unauthorizedJson } from "@/lib/auth/session"
import { getPool } from '@/lib/db'

export async function GET(request: Request) {
  if (!getAdminSessionFromRequest(request)) {
    return unauthorizedJson()
  }

  try {
    const client = await getPool().connect()
    
    try {
      // Query to see all tables across all schemas
      const query = `
        SELECT 
          n.nspname as schema_name,
          c.relname as table_name,
          CASE c.relkind
            WHEN 'r' THEN 'table'
            WHEN 'v' THEN 'view'
            WHEN 'm' THEN 'materialized view'
            ELSE 'other'
          END as object_type
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r', 'v', 'm')
          AND n.nspname NOT LIKE 'pg_%'
          AND n.nspname != 'information_schema'
        ORDER BY n.nspname, c.relname
      `
      
      const result = await client.query(query)
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