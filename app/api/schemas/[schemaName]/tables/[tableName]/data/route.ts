import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRequest } from "@/lib/auth/session"
import { getPool } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ schemaName: string; tableName: string }> }
) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  try {
    const { schemaName, tableName } = await params
    const client = await getPool().connect()
    
    try {
      const query = `SELECT * FROM "${schemaName}"."${tableName}" LIMIT 1000`
      const result = await client.query(query)
      client.release()
      
      return NextResponse.json(result.rows)
      
    } catch (error) {
      client.release()
      throw error
    }
    
  } catch (error: any) {
    console.error('Error fetching table data:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch table data' },
      { status: 500 }
    )
  }
}