import type { PoolClient } from "pg"
import {
  CONTROL_TABLE_NAME,
  getControlSchema,
  quotePgIdentifier,
} from "@/lib/control-schema"

export const SCHEMA_ACCESS_TABLE_NAME = "schema_access"

function getQuotedSuperadminTableRef() {
  return `${quotePgIdentifier(getControlSchema())}.${quotePgIdentifier(CONTROL_TABLE_NAME)}`
}

export function getQuotedSchemaAccessTableRef() {
  return `${quotePgIdentifier(getControlSchema())}.${quotePgIdentifier(SCHEMA_ACCESS_TABLE_NAME)}`
}

export async function ensureSchemaAccessTable(client: PoolClient) {
  const schemaAccessRef = getQuotedSchemaAccessTableRef()
  const superadminRef = getQuotedSuperadminTableRef()

  await client.query(`
    CREATE TABLE IF NOT EXISTS ${schemaAccessRef} (
      schema_name text PRIMARY KEY,
      superadmin_id integer NOT NULL REFERENCES ${superadminRef} (id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `)

  await client.query(`
    CREATE INDEX IF NOT EXISTS ${quotePgIdentifier(`${SCHEMA_ACCESS_TABLE_NAME}_superadmin_idx`)}
    ON ${schemaAccessRef} (superadmin_id)
  `)
}

export async function getAccessibleSchemaNames(client: PoolClient, superadminId: number) {
  await ensureSchemaAccessTable(client)

  const result = await client.query<{ schema_name: string }>(
    `
      SELECT n.nspname AS schema_name
      FROM pg_catalog.pg_namespace n
      LEFT JOIN ${getQuotedSchemaAccessTableRef()} access_map
        ON access_map.schema_name = n.nspname
      WHERE n.nspname NOT LIKE 'pg_%'
        AND n.nspname != 'information_schema'
        AND n.nspname NOT LIKE '%backup%'
        AND (access_map.superadmin_id IS NULL OR access_map.superadmin_id = $1)
      ORDER BY n.nspname
    `,
    [superadminId]
  )

  return new Set(result.rows.map((row) => row.schema_name))
}

export async function canAccessSchema(
  client: PoolClient,
  superadminId: number,
  schemaName: string
) {
  await ensureSchemaAccessTable(client)

  const result = await client.query<{ allowed: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_namespace n
        LEFT JOIN ${getQuotedSchemaAccessTableRef()} access_map
          ON access_map.schema_name = n.nspname
        WHERE n.nspname = $1
          AND (access_map.superadmin_id IS NULL OR access_map.superadmin_id = $2)
      ) AS allowed
    `,
    [schemaName, superadminId]
  )

  return Boolean(result.rows[0]?.allowed)
}

export async function assignSchemaOwner(
  client: PoolClient,
  schemaName: string,
  superadminId: number | null
) {
  await ensureSchemaAccessTable(client)

  if (superadminId === null) {
    await client.query(
      `DELETE FROM ${getQuotedSchemaAccessTableRef()} WHERE schema_name = $1`,
      [schemaName]
    )
    return
  }

  await client.query(
    `
      INSERT INTO ${getQuotedSchemaAccessTableRef()} (schema_name, superadmin_id, updated_at)
      VALUES ($1, $2, now())
      ON CONFLICT (schema_name)
      DO UPDATE
      SET superadmin_id = EXCLUDED.superadmin_id,
          updated_at = now()
    `,
    [schemaName, superadminId]
  )
}

export async function renameSchemaOwnerRecord(
  client: PoolClient,
  oldSchemaName: string,
  newSchemaName: string
) {
  await ensureSchemaAccessTable(client)

  await client.query(
    `
      UPDATE ${getQuotedSchemaAccessTableRef()}
      SET schema_name = $2,
          updated_at = now()
      WHERE schema_name = $1
    `,
    [oldSchemaName, newSchemaName]
  )
}

export async function removeSchemaOwnerRecord(client: PoolClient, schemaName: string) {
  await ensureSchemaAccessTable(client)

  await client.query(
    `DELETE FROM ${getQuotedSchemaAccessTableRef()} WHERE schema_name = $1`,
    [schemaName]
  )
}

export async function getSuperadminById(client: PoolClient, superadminId: number) {
  const result = await client.query<{ id: number; email: string }>(
    `
      SELECT id, email
      FROM ${getQuotedSuperadminTableRef()}
      WHERE id = $1
      LIMIT 1
    `,
    [superadminId]
  )

  return result.rows[0] ?? null
}
