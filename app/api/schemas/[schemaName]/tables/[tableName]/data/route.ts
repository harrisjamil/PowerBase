import { NextRequest, NextResponse } from 'next/server'
import { requirePrincipalRequest } from "@/lib/auth/principal-session"
import type { PoolClient } from 'pg'
import { getPool } from '@/lib/db'
import { isSafePgIdentifier, quotePgIdentifier } from "@/lib/control-schema"
import { canPrincipalAccessSchema } from "@/lib/principal-access"

type TableColumnMeta = {
  column_name: string
  data_type: string
  is_nullable: "YES" | "NO"
  column_default: string | null
  is_primary_key: boolean
  is_identity: boolean
  is_generated: boolean
  ordinal_position: number
}

type RowMutationBody = {
  primaryKeys?: unknown
  values?: unknown
}

class RequestValidationError extends Error {}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function invalidIdentifierResponse() {
  return NextResponse.json(
    { success: false, error: "Enter a valid schema and table name." },
    { status: 400 }
  )
}

function getRecord(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestValidationError(`Enter valid ${label}.`)
  }

  return value as Record<string, unknown>
}

async function loadTableColumns(client: PoolClient, schemaName: string, tableName: string) {
  const result = await client.query<TableColumnMeta>(
    `
      SELECT
        a.attname AS column_name,
        pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
        CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END AS is_nullable,
        pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS column_default,
        CASE WHEN pk.contype = 'p' THEN true ELSE false END AS is_primary_key,
        CASE WHEN a.attidentity <> '' THEN true ELSE false END AS is_identity,
        CASE WHEN a.attgenerated <> '' THEN true ELSE false END AS is_generated,
        a.attnum AS ordinal_position
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
    `,
    [schemaName, tableName]
  )

  if (result.rows.length === 0) {
    throw new RequestValidationError("Table not found or has no visible columns.")
  }

  return result.rows
}

function validateProvidedColumns(
  values: Record<string, unknown>,
  columnsByName: Map<string, TableColumnMeta>,
  options: { allowGenerated?: boolean; allowIdentity?: boolean } = {}
) {
  for (const [columnName, value] of Object.entries(values)) {
    const column = columnsByName.get(columnName)
    if (!column) {
      throw new RequestValidationError(`Column "${columnName}" does not exist on this table.`)
    }

    if (!options.allowGenerated && column.is_generated) {
      throw new RequestValidationError(`Column "${columnName}" is generated and cannot be modified.`)
    }

    if (!options.allowIdentity && column.is_identity) {
      throw new RequestValidationError(`Column "${columnName}" is identity-managed and cannot be modified directly.`)
    }

    if (value === null && column.is_nullable === "NO") {
      throw new RequestValidationError(`Column "${columnName}" cannot be null.`)
    }
  }
}

function getValidatedPrimaryKeyEntries(
  columns: TableColumnMeta[],
  columnsByName: Map<string, TableColumnMeta>,
  primaryKeys: Record<string, unknown>
) {
  const primaryKeyColumns = columns.filter((column) => column.is_primary_key)
  if (primaryKeyColumns.length === 0) {
    throw new RequestValidationError("This table cannot be edited because it has no primary key.")
  }

  for (const column of primaryKeyColumns) {
    if (!Object.prototype.hasOwnProperty.call(primaryKeys, column.column_name)) {
      throw new RequestValidationError(`Primary key "${column.column_name}" is required.`)
    }

    if (primaryKeys[column.column_name] === null || primaryKeys[column.column_name] === undefined) {
      throw new RequestValidationError(`Primary key "${column.column_name}" is required.`)
    }
  }

  validateProvidedColumns(primaryKeys, columnsByName, { allowGenerated: false, allowIdentity: true })

  return primaryKeyColumns.map((column) => [
    column.column_name,
    primaryKeys[column.column_name],
  ] as const)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ schemaName: string; tableName: string }> }
) {
  const auth = requirePrincipalRequest(request)
  if (!auth.ok) return auth.response

  try {
    const { schemaName, tableName } = await params
    if (!isSafePgIdentifier(schemaName) || !isSafePgIdentifier(tableName)) {
      return invalidIdentifierResponse()
    }
    const client = await getPool().connect()
    
    try {
      if (!(await canPrincipalAccessSchema(client, auth.session, schemaName))) {
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ schemaName: string; tableName: string }> }
) {
  const auth = requirePrincipalRequest(request)
  if (!auth.ok) return auth.response

  try {
    const { schemaName, tableName } = await params
    if (!isSafePgIdentifier(schemaName) || !isSafePgIdentifier(tableName)) {
      return invalidIdentifierResponse()
    }

    const body = (await request.json()) as RowMutationBody
    const values = getRecord(body.values, "row values")
    const client = await getPool().connect()

    try {
      if (!(await canPrincipalAccessSchema(client, auth.session, schemaName))) {
        client.release()
        return NextResponse.json(
          { success: false, error: "You do not have access to this schema." },
          { status: 403 }
        )
      }

      const columns = await loadTableColumns(client, schemaName, tableName)
      const columnsByName = new Map(columns.map((column) => [column.column_name, column]))
      validateProvidedColumns(values, columnsByName)

      const requiredColumns = columns.filter(
        (column) =>
          column.is_nullable === "NO" &&
          !column.column_default &&
          !column.is_identity &&
          !column.is_generated
      )

      for (const column of requiredColumns) {
        if (!Object.prototype.hasOwnProperty.call(values, column.column_name)) {
          throw new RequestValidationError(`Column "${column.column_name}" is required.`)
        }
      }

      const providedEntries = Object.entries(values)
      let result

      if (providedEntries.length === 0) {
        result = await client.query(
          `INSERT INTO ${quotePgIdentifier(schemaName)}.${quotePgIdentifier(tableName)} DEFAULT VALUES RETURNING *`
        )
      } else {
        const columnNames = providedEntries.map(([columnName]) => quotePgIdentifier(columnName))
        const placeholders = providedEntries.map((_, index) => `$${index + 1}`)
        result = await client.query(
          `INSERT INTO ${quotePgIdentifier(schemaName)}.${quotePgIdentifier(tableName)} (${columnNames.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
          providedEntries.map(([, value]) => value)
        )
      }

      client.release()

      return NextResponse.json({
        success: true,
        row: result.rows[0] ?? null,
      })
    } catch (error) {
      client.release()
      if (error instanceof RequestValidationError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 400 }
        )
      }
      throw error
    }
  } catch (error: unknown) {
    if (error instanceof RequestValidationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      )
    }
    console.error('Error inserting table row:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error, 'Failed to insert table row') },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ schemaName: string; tableName: string }> }
) {
  const auth = requirePrincipalRequest(request)
  if (!auth.ok) return auth.response

  try {
    const { schemaName, tableName } = await params
    if (!isSafePgIdentifier(schemaName) || !isSafePgIdentifier(tableName)) {
      return invalidIdentifierResponse()
    }

    const body = (await request.json()) as RowMutationBody
    const primaryKeys = getRecord(body.primaryKeys, "primary key values")
    const values = getRecord(body.values, "row values")

    if (Object.keys(values).length === 0) {
      return NextResponse.json(
        { success: false, error: "Select at least one column to update." },
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

      const columns = await loadTableColumns(client, schemaName, tableName)
      const columnsByName = new Map(columns.map((column) => [column.column_name, column]))
      validateProvidedColumns(values, columnsByName)

      const valueEntries = Object.entries(values)
      const primaryKeyEntries = getValidatedPrimaryKeyEntries(columns, columnsByName, primaryKeys)

      const setClauses = valueEntries.map(
        ([columnName], index) => `${quotePgIdentifier(columnName)} = $${index + 1}`
      )
      const whereClauses = primaryKeyEntries.map(
        ([columnName], index) =>
          `${quotePgIdentifier(columnName)} = $${valueEntries.length + index + 1}`
      )

      const result = await client.query(
        `UPDATE ${quotePgIdentifier(schemaName)}.${quotePgIdentifier(tableName)} SET ${setClauses.join(", ")} WHERE ${whereClauses.join(" AND ")} RETURNING *`,
        [
          ...valueEntries.map(([, value]) => value),
          ...primaryKeyEntries.map(([, value]) => value),
        ]
      )

      client.release()

      if (result.rowCount === 0) {
        return NextResponse.json(
          { success: false, error: "The selected row no longer exists." },
          { status: 404 }
        )
      }

      return NextResponse.json({
        success: true,
        row: result.rows[0] ?? null,
      })
    } catch (error) {
      client.release()
      if (error instanceof RequestValidationError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 400 }
        )
      }
      throw error
    }
  } catch (error: unknown) {
    if (error instanceof RequestValidationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      )
    }
    console.error('Error updating table row:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error, 'Failed to update table row') },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ schemaName: string; tableName: string }> }
) {
  const auth = requirePrincipalRequest(request)
  if (!auth.ok) return auth.response

  try {
    const { schemaName, tableName } = await params
    if (!isSafePgIdentifier(schemaName) || !isSafePgIdentifier(tableName)) {
      return invalidIdentifierResponse()
    }

    const body = (await request.json()) as RowMutationBody
    const primaryKeys = getRecord(body.primaryKeys, "primary key values")
    const client = await getPool().connect()

    try {
      if (!(await canPrincipalAccessSchema(client, auth.session, schemaName))) {
        client.release()
        return NextResponse.json(
          { success: false, error: "You do not have access to this schema." },
          { status: 403 }
        )
      }

      const columns = await loadTableColumns(client, schemaName, tableName)
      const columnsByName = new Map(columns.map((column) => [column.column_name, column]))
      const primaryKeyEntries = getValidatedPrimaryKeyEntries(columns, columnsByName, primaryKeys)

      const whereClauses = primaryKeyEntries.map(
        ([columnName], index) => `${quotePgIdentifier(columnName)} = $${index + 1}`
      )

      const result = await client.query(
        `DELETE FROM ${quotePgIdentifier(schemaName)}.${quotePgIdentifier(tableName)} WHERE ${whereClauses.join(" AND ")} RETURNING *`,
        primaryKeyEntries.map(([, value]) => value)
      )

      client.release()

      if (result.rowCount === 0) {
        return NextResponse.json(
          { success: false, error: "The selected row no longer exists." },
          { status: 404 }
        )
      }

      return NextResponse.json({
        success: true,
        row: result.rows[0] ?? null,
      })
    } catch (error) {
      client.release()
      if (error instanceof RequestValidationError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 400 }
        )
      }
      throw error
    }
  } catch (error: unknown) {
    if (error instanceof RequestValidationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      )
    }
    console.error('Error deleting table row:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error, 'Failed to delete table row') },
      { status: 500 }
    )
  }
}