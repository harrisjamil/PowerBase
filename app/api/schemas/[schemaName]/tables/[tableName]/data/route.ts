import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRequest } from "@/lib/auth/session"
import { getPool } from '@/lib/db'
import { isSafePgIdentifier, quotePgIdentifier } from "@/lib/control-schema"
import { canAccessSchema } from "@/lib/schema-access"

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ schemaName: string; tableName: string }> }
) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  try {
    const { schemaName, tableName } = await params
    if (!isSafePgIdentifier(schemaName) || !isSafePgIdentifier(tableName)) {
      return NextResponse.json(
        { error: "Enter a valid schema and table name." },
        { status: 400 }
      )
    }
    const client = await getPool().connect()
    
    try {
      if (!(await canAccessSchema(client, auth.session.id, schemaName))) {
        client.release()
        return NextResponse.json(
          { error: "You do not have access to this schema." },
          { status: 403 }
        )
      }

      const query = `SELECT * FROM ${quotePgIdentifier(schemaName)}.${quotePgIdentifier(tableName)} LIMIT 1000`
      const result = await client.query(query)
      client.release()
      
      return NextResponse.json(result.rows)
      
    } catch (error) {
      client.release()
      throw error
    }
    
  } catch (error: unknown) {
    console.error('Error fetching table data:', error)
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to fetch table data') },
      { status: 500 }
    )
  }
}