import type { PoolClient } from "pg"
import { isSafePgIdentifier, quotePgIdentifier } from "@/lib/control-schema"

export type TableColumnMeta = {
  column_name: string
  data_type: string
  is_nullable: "YES" | "NO"
  column_default: string | null
  is_primary_key: boolean
  is_identity: boolean
  is_generated: boolean
  ordinal_position: number
}

export class SchemaTableRequestError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export async function loadTableColumns(client: PoolClient, schemaName: string, tableName: string) {
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
    throw new SchemaTableRequestError("Table not found or has no visible columns.", 404)
  }

  return result.rows
}

export function validateProvidedColumns(
  values: Record<string, unknown>,
  columnsByName: Map<string, TableColumnMeta>,
  options: { allowGenerated?: boolean; allowIdentity?: boolean } = {}
) {
  for (const [columnName, value] of Object.entries(values)) {
    const column = columnsByName.get(columnName)
    if (!column) {
      throw new SchemaTableRequestError(`Column "${columnName}" does not exist on this table.`)
    }

    if (!options.allowGenerated && column.is_generated) {
      throw new SchemaTableRequestError(`Column "${columnName}" is generated and cannot be modified.`)
    }

    if (!options.allowIdentity && column.is_identity) {
      throw new SchemaTableRequestError(
        `Column "${columnName}" is identity-managed and cannot be modified directly.`
      )
    }

    if (value === null && column.is_nullable === "NO") {
      throw new SchemaTableRequestError(`Column "${columnName}" cannot be null.`)
    }
  }
}

export function getValidatedPrimaryKeyEntries(
  columns: TableColumnMeta[],
  columnsByName: Map<string, TableColumnMeta>,
  primaryKeys: Record<string, unknown>
) {
  const primaryKeyColumns = columns.filter((column) => column.is_primary_key)
  if (primaryKeyColumns.length === 0) {
    throw new SchemaTableRequestError(
      "This table cannot be edited because it has no primary key."
    )
  }

  for (const column of primaryKeyColumns) {
    if (!Object.prototype.hasOwnProperty.call(primaryKeys, column.column_name)) {
      throw new SchemaTableRequestError(`Primary key "${column.column_name}" is required.`)
    }

    if (primaryKeys[column.column_name] === null || primaryKeys[column.column_name] === undefined) {
      throw new SchemaTableRequestError(`Primary key "${column.column_name}" is required.`)
    }
  }

  validateProvidedColumns(primaryKeys, columnsByName, {
    allowGenerated: false,
    allowIdentity: true,
  })

  return primaryKeyColumns.map(
    (column) => [column.column_name, primaryKeys[column.column_name]] as const
  )
}

export type EqFilter = {
  column: string
  value: string
}

export function parseEqFilters(searchParams: URLSearchParams): EqFilter[] {
  const filters: EqFilter[] = []

  for (const [key, rawValue] of searchParams.entries()) {
    if (key === "select" || key === "limit" || key === "offset" || key === "order") {
      continue
    }

    const match = rawValue.match(/^eq\.(.+)$/)
    if (!match) {
      throw new SchemaTableRequestError(
        `Unsupported filter "${key}=${rawValue}". Use ${key}=eq.<value> format.`
      )
    }

    if (!isSafePgIdentifier(key)) {
      throw new SchemaTableRequestError(`Invalid filter column "${key}".`)
    }

    filters.push({ column: key, value: match[1] })
  }

  return filters
}

export async function selectTableRows(
  client: PoolClient,
  schemaName: string,
  tableName: string,
  options: {
    filters: EqFilter[]
    limit: number
    offset: number
    order?: string
  }
) {
  const whereClauses: string[] = []
  const values: unknown[] = []

  for (const filter of options.filters) {
    values.push(filter.value)
    whereClauses.push(
      `${quotePgIdentifier(filter.column)} = $${values.length}`
    )
  }

  let orderClause = ""
  if (options.order) {
    const [column, direction] = options.order.split(".")
    if (!column || !isSafePgIdentifier(column)) {
      throw new SchemaTableRequestError("Invalid order parameter.")
    }
    const normalizedDirection = direction?.toLowerCase() === "desc" ? "DESC" : "ASC"
    orderClause = ` ORDER BY ${quotePgIdentifier(column)} ${normalizedDirection}`
  }

  values.push(options.limit)
  const limitParam = `$${values.length}`
  values.push(options.offset)
  const offsetParam = `$${values.length}`

  const whereSql = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(" AND ")}` : ""
  const query = `SELECT * FROM ${quotePgIdentifier(schemaName)}.${quotePgIdentifier(tableName)}${whereSql}${orderClause} LIMIT ${limitParam} OFFSET ${offsetParam}`

  const result = await client.query(query, values)
  return result.rows
}

export async function insertTableRow(
  client: PoolClient,
  schemaName: string,
  tableName: string,
  values: Record<string, unknown>
) {
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
      throw new SchemaTableRequestError(`Column "${column.column_name}" is required.`)
    }
  }

  const providedEntries = Object.entries(values)

  if (providedEntries.length === 0) {
    const result = await client.query(
      `INSERT INTO ${quotePgIdentifier(schemaName)}.${quotePgIdentifier(tableName)} DEFAULT VALUES RETURNING *`
    )
    return result.rows[0] ?? null
  }

  const columnNames = providedEntries.map(([columnName]) => quotePgIdentifier(columnName))
  const placeholders = providedEntries.map((_, index) => `$${index + 1}`)
  const result = await client.query(
    `INSERT INTO ${quotePgIdentifier(schemaName)}.${quotePgIdentifier(tableName)} (${columnNames.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
    providedEntries.map(([, value]) => value)
  )

  return result.rows[0] ?? null
}

export async function updateTableRows(
  client: PoolClient,
  schemaName: string,
  tableName: string,
  filters: EqFilter[],
  values: Record<string, unknown>
) {
  if (Object.keys(values).length === 0) {
    throw new SchemaTableRequestError("Select at least one column to update.")
  }

  const columns = await loadTableColumns(client, schemaName, tableName)
  const columnsByName = new Map(columns.map((column) => [column.column_name, column]))
  validateProvidedColumns(values, columnsByName)

  const valueEntries = Object.entries(values)
  const filterValues: unknown[] = []
  const whereClauses = filters.map((filter) => {
    filterValues.push(filter.value)
    return `${quotePgIdentifier(filter.column)} = $${filterValues.length}`
  })

  if (whereClauses.length === 0) {
    throw new SchemaTableRequestError("At least one eq filter is required for update.")
  }

  const setClauses = valueEntries.map(
    ([columnName], index) =>
      `${quotePgIdentifier(columnName)} = $${filterValues.length + index + 1}`
  )

  const result = await client.query(
    `UPDATE ${quotePgIdentifier(schemaName)}.${quotePgIdentifier(tableName)} SET ${setClauses.join(", ")} WHERE ${whereClauses.join(" AND ")} RETURNING *`,
    [...filterValues, ...valueEntries.map(([, value]) => value)]
  )

  return result.rows
}

export async function deleteTableRows(
  client: PoolClient,
  schemaName: string,
  tableName: string,
  filters: EqFilter[]
) {
  if (filters.length === 0) {
    throw new SchemaTableRequestError("At least one eq filter is required for delete.")
  }

  await loadTableColumns(client, schemaName, tableName)

  const filterValues: unknown[] = []
  const whereClauses = filters.map((filter) => {
    filterValues.push(filter.value)
    return `${quotePgIdentifier(filter.column)} = $${filterValues.length}`
  })

  const result = await client.query(
    `DELETE FROM ${quotePgIdentifier(schemaName)}.${quotePgIdentifier(tableName)} WHERE ${whereClauses.join(" AND ")} RETURNING *`,
    filterValues
  )

  return result.rows
}
