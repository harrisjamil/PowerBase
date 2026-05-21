import type { PoolClient } from "pg"
import {
  CONTROL_TABLE_NAME,
  ensureControlSchema,
  getControlSchema,
  getQuotedControlTableRef,
  quotePgIdentifier,
} from "@/lib/control-schema"
import { ensureDbBootstrap } from "@/lib/db-bootstrap-cache"

function getBootstrapKey(client: PoolClient) {
  const connection = client as PoolClient & {
    connectionParameters?: {
      host?: string
      port?: number | string
      database?: string
    }
  }
  return [
    connection.connectionParameters?.host || "",
    String(connection.connectionParameters?.port || ""),
    connection.connectionParameters?.database || "",
    getControlSchema(),
    "superadmin",
  ].join("::")
}

export async function controlRelationExists(
  client: PoolClient,
  tableName: string
): Promise<boolean> {
  const schema = getControlSchema()
  const result = await client.query<{ exists: boolean }>(
    `
      SELECT to_regclass($1) IS NOT NULL AS exists
    `,
    [`${schema}.${tableName}`]
  )
  return Boolean(result.rows[0]?.exists)
}

export async function ensureSuperadminTable(client: PoolClient) {
  await ensureDbBootstrap(getBootstrapKey(client), async () => {
    await ensureControlSchema(client)
    const tableRef = getQuotedControlTableRef()

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${tableRef} (
        id serial PRIMARY KEY,
        email text NOT NULL,
        password text NOT NULL DEFAULT '',
        created_at timestamp NOT NULL DEFAULT now(),
        test text NULL
      )
    `)

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ${quotePgIdentifier(`${CONTROL_TABLE_NAME}_email_idx`)}
      ON ${tableRef} (lower(email))
    `)
  })
}
