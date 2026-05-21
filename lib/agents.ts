import type { PoolClient } from "pg"
import {
  AGENTS_TABLE_NAME,
  getControlSchema,
  getQuotedAgentsTableRef,
  getQuotedControlTableRef,
  quotePgIdentifier,
} from "@/lib/control-schema"
import { ensureSuperadminTable } from "@/lib/superadmin-table"

export type AgentRecord = {
  id: number
  email: string
  created_at: string | null
  has_password: boolean
  superadmin_id: number | null
  superadmin_email: string | null
}

export function readAgentEmail(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim().toLowerCase()
  if (!trimmed || trimmed.length > 255) return null
  return trimmed
}

export async function ensureAgentsTable(client: PoolClient) {
  await ensureSuperadminTable(client)

  const tableRef = getQuotedAgentsTableRef()
  const superadminRef = getQuotedControlTableRef()
  const sequenceName = `${AGENTS_TABLE_NAME}_id_seq`
  const sequenceRef = `${quotePgIdentifier(getControlSchema())}.${quotePgIdentifier(sequenceName)}`
  const sequenceRegclassLiteral = `'${sequenceRef}'::regclass`

  await client.query(`
    CREATE TABLE IF NOT EXISTS ${tableRef} (
      id serial PRIMARY KEY,
      email text NOT NULL,
      password text NOT NULL,
      created_at timestamp NOT NULL DEFAULT now(),
      superadmin_id integer NULL REFERENCES ${superadminRef} (id) ON DELETE SET NULL
    )
  `)

  await client.query(`
    ALTER TABLE ${tableRef}
    ADD COLUMN IF NOT EXISTS email text,
    ADD COLUMN IF NOT EXISTS password text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS created_at timestamp NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS superadmin_id integer NULL REFERENCES ${superadminRef} (id) ON DELETE SET NULL
  `)

  await client.query(`
    CREATE SEQUENCE IF NOT EXISTS ${sequenceRef}
  `)

  await client.query(`
    ALTER SEQUENCE ${sequenceRef}
    OWNED BY ${tableRef}.id
  `)

  await client.query(`
    ALTER TABLE ${tableRef}
    ALTER COLUMN id SET DEFAULT nextval(${sequenceRegclassLiteral})
  `)

  await client.query(`
    ALTER TABLE ${tableRef}
    ALTER COLUMN created_at SET DEFAULT now()
  `)

  await client.query(`
    SELECT setval(
      ${sequenceRegclassLiteral},
      COALESCE((SELECT MAX(id) FROM ${tableRef}), 0) + 1,
      false
    )
  `)

  await client.query(`
    UPDATE ${tableRef}
    SET created_at = now()
    WHERE created_at IS NULL
  `)

  await client.query(`
    CREATE INDEX IF NOT EXISTS ${quotePgIdentifier(`${AGENTS_TABLE_NAME}_email_idx`)}
    ON ${tableRef} (lower(email))
  `)

  await client.query(`
    CREATE INDEX IF NOT EXISTS ${quotePgIdentifier(`${AGENTS_TABLE_NAME}_superadmin_idx`)}
    ON ${tableRef} (superadmin_id)
  `)
}
