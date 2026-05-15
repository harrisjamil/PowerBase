import { NextResponse } from "next/server"
import { requirePrincipalRequest } from "@/lib/auth/principal-session"
import { getPool } from "@/lib/db"
import { getAccessibleSchemaNamesForPrincipal } from "@/lib/principal-access"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Failed to fetch schema hierarchy"
}

export async function GET(request: Request) {
  const auth = requirePrincipalRequest(request)
  if (!auth.ok) return auth.response

  try {
    const client = await getPool().connect()

    try {
      const accessibleSchemas = await getAccessibleSchemaNamesForPrincipal(client, auth.session)

      const schemasQuery = `
        SELECT
          n.nspname AS schema_name,
          COALESCE(pg_catalog.pg_get_userbyid(n.nspowner), 'unknown') AS owner,
          COUNT(DISTINCT c.oid) FILTER (
            WHERE c.relkind IN ('r', 'v', 'm', 'p')
              AND c.relname NOT LIKE 'pg_%'
              AND c.relname NOT LIKE 'sql_%'
          ) AS table_count,
          COALESCE(
            pg_catalog.pg_size_pretty(SUM(pg_total_relation_size(c.oid))),
            '0 bytes'
          ) AS total_size,
          pg_catalog.obj_description(n.oid) AS description
        FROM pg_catalog.pg_namespace n
        LEFT JOIN pg_catalog.pg_class c
          ON c.relnamespace = n.oid
          AND c.relkind IN ('r', 'v', 'm', 'p')
          AND c.relname NOT LIKE 'pg_%'
          AND c.relname NOT LIKE 'sql_%'
        WHERE n.nspname NOT LIKE 'pg_%'
          AND n.nspname != 'information_schema'
          AND n.nspname NOT LIKE '%backup%'
        GROUP BY n.nspname, n.nspowner, n.oid
        ORDER BY n.nspname
      `

      const tablesQuery = `
        SELECT
          n.nspname AS schema_name,
          c.relname AS table_name,
          CASE c.relkind
            WHEN 'r' THEN 'BASE TABLE'
            WHEN 'v' THEN 'VIEW'
            WHEN 'm' THEN 'MATERIALIZED VIEW'
            WHEN 'p' THEN 'PARTITIONED TABLE'
            ELSE 'OTHER'
          END AS table_type,
          pg_catalog.obj_description(c.oid) AS description
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname NOT LIKE 'pg_%'
          AND n.nspname != 'information_schema'
          AND n.nspname NOT LIKE '%backup%'
          AND c.relkind IN ('r', 'v', 'm', 'p')
          AND c.relname NOT LIKE 'pg_%'
          AND c.relname NOT LIKE 'sql_%'
        ORDER BY n.nspname, c.relname
      `

      const relationshipsQuery = `
        SELECT
          con.conname AS constraint_name,
          source_ns.nspname AS from_schema,
          source_cls.relname AS from_table,
          source_att.attname AS from_column,
          target_ns.nspname AS to_schema,
          target_cls.relname AS to_table,
          target_att.attname AS to_column
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_class source_cls
          ON source_cls.oid = con.conrelid
        JOIN pg_catalog.pg_namespace source_ns
          ON source_ns.oid = source_cls.relnamespace
        JOIN pg_catalog.pg_class target_cls
          ON target_cls.oid = con.confrelid
        JOIN pg_catalog.pg_namespace target_ns
          ON target_ns.oid = target_cls.relnamespace
        JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS source_key(attnum, ord)
          ON true
        JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS target_key(attnum, ord)
          ON source_key.ord = target_key.ord
        JOIN pg_catalog.pg_attribute source_att
          ON source_att.attrelid = con.conrelid
          AND source_att.attnum = source_key.attnum
        JOIN pg_catalog.pg_attribute target_att
          ON target_att.attrelid = con.confrelid
          AND target_att.attnum = target_key.attnum
        WHERE con.contype = 'f'
          AND source_ns.nspname NOT LIKE 'pg_%'
          AND target_ns.nspname NOT LIKE 'pg_%'
          AND source_ns.nspname != 'information_schema'
          AND target_ns.nspname != 'information_schema'
          AND source_ns.nspname NOT LIKE '%backup%'
          AND target_ns.nspname NOT LIKE '%backup%'
        ORDER BY
          source_ns.nspname,
          source_cls.relname,
          con.conname,
          source_key.ord
      `

      const columnsQuery = `
        SELECT
          n.nspname AS schema_name,
          c.relname AS table_name,
          a.attname AS column_name,
          pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
          CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END AS is_nullable,
          CASE WHEN pk.contype = 'p' THEN true ELSE false END AS is_primary_key,
          CASE WHEN fk.contype = 'f' THEN true ELSE false END AS is_foreign_key,
          a.attnum AS ordinal_position
        FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c
          ON c.oid = a.attrelid
        JOIN pg_catalog.pg_namespace n
          ON n.oid = c.relnamespace
        LEFT JOIN pg_catalog.pg_constraint pk
          ON pk.conrelid = a.attrelid
          AND pk.contype = 'p'
          AND a.attnum = ANY(pk.conkey)
        LEFT JOIN pg_catalog.pg_constraint fk
          ON fk.conrelid = a.attrelid
          AND fk.contype = 'f'
          AND a.attnum = ANY(fk.conkey)
        WHERE n.nspname NOT LIKE 'pg_%'
          AND n.nspname != 'information_schema'
          AND n.nspname NOT LIKE '%backup%'
          AND c.relkind IN ('r', 'v', 'm', 'p')
          AND c.relname NOT LIKE 'pg_%'
          AND c.relname NOT LIKE 'sql_%'
          AND a.attnum > 0
          AND NOT a.attisdropped
        ORDER BY n.nspname, c.relname, a.attnum
      `

      const schemasResult = await client.query(schemasQuery)
      const tablesResult = await client.query(tablesQuery)
      const relationshipsResult = await client.query(relationshipsQuery)
      const columnsResult = await client.query(columnsQuery)

      const visibleSchemas = schemasResult.rows.filter((schema) =>
        accessibleSchemas.has(schema.schema_name)
      )
      const visibleTables = tablesResult.rows.filter((table) =>
        accessibleSchemas.has(table.schema_name)
      )
      const visibleRelationships = relationshipsResult.rows.filter(
        (relationship) =>
          accessibleSchemas.has(relationship.from_schema) &&
          accessibleSchemas.has(relationship.to_schema)
      )
      const visibleColumns = columnsResult.rows.filter((column) =>
        accessibleSchemas.has(column.schema_name)
      )

      client.release()

      return NextResponse.json({
        success: true,
        schemas: visibleSchemas,
        tables: visibleTables,
        relationships: visibleRelationships,
        columns: visibleColumns,
        counts: {
          schemas: visibleSchemas.length,
          tables: visibleTables.length,
          relationships: visibleRelationships.length,
          columns: visibleColumns.length,
        },
      })
    } catch (error) {
      client.release()
      throw error
    }
  } catch (error: unknown) {
    console.error("Failed to fetch schema hierarchy:", error)
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error),
      },
      { status: 500 }
    )
  }
}
