import type { PoolClient } from "pg"
import {
  CONTROL_TABLE_NAME,
  PROJECTS_TABLE_NAME,
  getControlSchema,
  getQuotedProjectsTableRef,
  quotePgIdentifier,
} from "@/lib/control-schema"

function getQuotedSuperadminTableRef() {
  return `${quotePgIdentifier(getControlSchema())}.${quotePgIdentifier(CONTROL_TABLE_NAME)}`
}

export async function ensureProjectsTable(client: PoolClient) {
  const tableRef = getQuotedProjectsTableRef()
  const superadminRef = getQuotedSuperadminTableRef()

  await client.query(`
    CREATE TABLE IF NOT EXISTS ${tableRef} (
      id serial PRIMARY KEY,
      name text NOT NULL,
      schema_name text NOT NULL UNIQUE,
      description text NULL,
      owner_superadmin_id integer NULL REFERENCES ${superadminRef} (id) ON DELETE SET NULL,
      status text NOT NULL DEFAULT 'active',
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `)

  await client.query(`
    CREATE INDEX IF NOT EXISTS ${quotePgIdentifier(`${PROJECTS_TABLE_NAME}_owner_superadmin_idx`)}
    ON ${tableRef} (owner_superadmin_id)
  `)
}

export async function upsertProjectRecord(
  client: PoolClient,
  input: {
    name: string
    schemaName: string
    description: string | null
    ownerSuperadminId: number | null
    status?: string
  }
) {
  await ensureProjectsTable(client)

  await client.query(
    `
      INSERT INTO ${getQuotedProjectsTableRef()} (
        name,
        schema_name,
        description,
        owner_superadmin_id,
        status,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, COALESCE($5, 'active'), now(), now())
      ON CONFLICT (schema_name)
      DO UPDATE
      SET name = EXCLUDED.name,
          description = EXCLUDED.description,
          owner_superadmin_id = EXCLUDED.owner_superadmin_id,
          status = EXCLUDED.status,
          updated_at = now()
    `,
    [
      input.name,
      input.schemaName,
      input.description,
      input.ownerSuperadminId,
      input.status ?? "active",
    ]
  )
}

export async function renameProjectRecord(
  client: PoolClient,
  oldSchemaName: string,
  next: {
    schemaName: string
    name?: string
    description?: string | null
    ownerSuperadminId?: number | null
  }
) {
  await ensureProjectsTable(client)

  const assignments: string[] = ["schema_name = $2", "updated_at = now()"]
  const values: Array<string | number | null> = [oldSchemaName, next.schemaName]
  let nextIndex = 3

  if (next.name !== undefined) {
    assignments.push(`name = $${nextIndex}`)
    values.push(next.name)
    nextIndex += 1
  }
  if (next.description !== undefined) {
    assignments.push(`description = $${nextIndex}`)
    values.push(next.description)
    nextIndex += 1
  }
  if (next.ownerSuperadminId !== undefined) {
    assignments.push(`owner_superadmin_id = $${nextIndex}`)
    values.push(next.ownerSuperadminId)
  }

  await client.query(
    `
      UPDATE ${getQuotedProjectsTableRef()}
      SET ${assignments.join(", ")}
      WHERE schema_name = $1
    `,
    values
  )
}

export async function removeProjectRecord(client: PoolClient, schemaName: string) {
  await ensureProjectsTable(client)
  await client.query(`DELETE FROM ${getQuotedProjectsTableRef()} WHERE schema_name = $1`, [schemaName])
}
