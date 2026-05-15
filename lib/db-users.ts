import { Client, type PoolClient } from "pg"
import { getEffectiveParsed } from "@/lib/effective-database-url"
import {
  getControlSchema,
  getQuotedDbUsersTableRef,
  getQuotedProjectsTableRef,
  isSafePgIdentifier,
  quotePgIdentifier,
} from "@/lib/control-schema"
import { ensureDbBootstrap } from "@/lib/db-bootstrap-cache"
import { ensureProjectsTable } from "@/lib/projects"

export type ManagedDbUserRecord = {
  id: number
  username: string
  project_id: number | null
  project_name: string | null
  schema_name: string | null
  created_at: string | null
  updated_at: string | null
  can_login: boolean
}

export type ManagedDbUserAssignment = {
  id: number
  username: string
  project_id: number | null
  project_name: string | null
  schema_name: string | null
}

function getClientConnectionParameters(client: PoolClient) {
  return (
    client as PoolClient & {
      connectionParameters?: {
        host?: string
        port?: number | string
        database?: string
      }
    }
  ).connectionParameters
}

function getDatabaseName(client: PoolClient) {
  const connection = getClientConnectionParameters(client)
  return connection?.database || getEffectiveParsed().database || "postgres"
}

function getDbUsersBootstrapKey(client: PoolClient) {
  const connection = getClientConnectionParameters(client)
  return [
    connection?.host || "",
    String(connection?.port || ""),
    connection?.database || "",
    getControlSchema(),
    "db-users",
  ].join("::")
}

function getQuotedSchemaAccessTableRef() {
  return `${quotePgIdentifier(getControlSchema())}.${quotePgIdentifier("schema_access")}`
}

function getQuotedRole(value: string) {
  return quotePgIdentifier(value)
}

export function readDbUsername(value: unknown): string | null {
  if (typeof value !== "string") return null
  const username = value.trim()
  if (!username || !isSafePgIdentifier(username)) {
    return null
  }
  return username
}

export function readProjectId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value)
  return null
}

export async function ensureDbUsersTable(client: PoolClient) {
  await ensureProjectsTable(client)

  await ensureDbBootstrap(getDbUsersBootstrapKey(client), async () => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${getQuotedDbUsersTableRef()} (
        id serial PRIMARY KEY,
        username text NOT NULL UNIQUE,
        project_id integer NULL REFERENCES ${getQuotedProjectsTableRef()} (id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS ${quotePgIdentifier("db_users_project_id_idx")}
      ON ${getQuotedDbUsersTableRef()} (project_id)
    `)
  })
}

async function roleExists(client: PoolClient, roleName: string) {
  const result = await client.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles
        WHERE rolname = $1
      ) AS exists
    `,
    [roleName]
  )

  return Boolean(result.rows[0]?.exists)
}

async function listManagedSchemaNames(client: PoolClient) {
  const result = await client.query<{ schema_name: string }>(
    `
      SELECT nspname AS schema_name
      FROM pg_catalog.pg_namespace
      WHERE nspname NOT LIKE 'pg_%'
        AND nspname <> 'information_schema'
        AND nspname NOT LIKE '%backup%'
        AND nspname <> $1
      ORDER BY nspname
    `,
    [getControlSchema()]
  )

  return result.rows.map((row) => row.schema_name)
}

async function revokeManagedSchemaPrivileges(
  client: PoolClient,
  roleName: string,
  schemaName: string
) {
  const quotedSchema = quotePgIdentifier(schemaName)
  const quotedRole = getQuotedRole(roleName)

  await client.query(`REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${quotedSchema} FROM ${quotedRole}`)
  await client.query(`REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ${quotedSchema} FROM ${quotedRole}`)
  await client.query(`REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA ${quotedSchema} FROM ${quotedRole}`)
  await client.query(`REVOKE ALL PRIVILEGES ON SCHEMA ${quotedSchema} FROM ${quotedRole}`)
  await client.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${quotedSchema} REVOKE ALL PRIVILEGES ON TABLES FROM ${quotedRole}`
  )
  await client.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${quotedSchema} REVOKE ALL PRIVILEGES ON SEQUENCES FROM ${quotedRole}`
  )
  await client.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${quotedSchema} REVOKE ALL PRIVILEGES ON ROUTINES FROM ${quotedRole}`
  )
}

async function grantAssignedSchemaPrivileges(
  client: PoolClient,
  roleName: string,
  schemaName: string
) {
  const quotedSchema = quotePgIdentifier(schemaName)
  const quotedRole = getQuotedRole(roleName)

  await client.query(`GRANT USAGE ON SCHEMA ${quotedSchema} TO ${quotedRole}`)
  await client.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${quotedSchema} TO ${quotedRole}`
  )
  await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${quotedSchema} TO ${quotedRole}`)
  await client.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${quotedSchema} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${quotedRole}`
  )
  await client.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${quotedSchema} GRANT USAGE, SELECT ON SEQUENCES TO ${quotedRole}`
  )
}

export async function listManagedDbUsers(client: PoolClient): Promise<ManagedDbUserRecord[]> {
  await ensureDbUsersTable(client)

  const result = await client.query<ManagedDbUserRecord>(
    `
      SELECT
        db_users.id,
        db_users.username,
        db_users.project_id,
        projects.name AS project_name,
        projects.schema_name,
        db_users.created_at::text,
        db_users.updated_at::text,
        COALESCE(pg_roles.rolcanlogin, false) AS can_login
      FROM ${getQuotedDbUsersTableRef()} db_users
      LEFT JOIN ${getQuotedProjectsTableRef()} projects
        ON projects.id = db_users.project_id
      LEFT JOIN pg_catalog.pg_roles
        ON pg_roles.rolname = db_users.username
      ORDER BY lower(db_users.username), db_users.id
    `
  )

  return result.rows
}

export async function getManagedDbUserById(
  client: PoolClient,
  id: number
): Promise<ManagedDbUserRecord | null> {
  await ensureDbUsersTable(client)

  const result = await client.query<ManagedDbUserRecord>(
    `
      SELECT
        db_users.id,
        db_users.username,
        db_users.project_id,
        projects.name AS project_name,
        projects.schema_name,
        db_users.created_at::text,
        db_users.updated_at::text,
        COALESCE(pg_roles.rolcanlogin, false) AS can_login
      FROM ${getQuotedDbUsersTableRef()} db_users
      LEFT JOIN ${getQuotedProjectsTableRef()} projects
        ON projects.id = db_users.project_id
      LEFT JOIN pg_catalog.pg_roles
        ON pg_roles.rolname = db_users.username
      WHERE db_users.id = $1
      LIMIT 1
    `,
    [id]
  )

  return result.rows[0] ?? null
}

export async function getManagedDbUserByUsername(
  client: PoolClient,
  username: string
): Promise<ManagedDbUserRecord | null> {
  await ensureDbUsersTable(client)

  const result = await client.query<ManagedDbUserRecord>(
    `
      SELECT
        db_users.id,
        db_users.username,
        db_users.project_id,
        projects.name AS project_name,
        projects.schema_name,
        db_users.created_at::text,
        db_users.updated_at::text,
        COALESCE(pg_roles.rolcanlogin, false) AS can_login
      FROM ${getQuotedDbUsersTableRef()} db_users
      LEFT JOIN ${getQuotedProjectsTableRef()} projects
        ON projects.id = db_users.project_id
      LEFT JOIN pg_catalog.pg_roles
        ON pg_roles.rolname = db_users.username
      WHERE lower(db_users.username) = lower($1)
      LIMIT 1
    `,
    [username]
  )

  return result.rows[0] ?? null
}

export async function getManagedDbUserAssignment(
  client: PoolClient,
  id: number
): Promise<ManagedDbUserAssignment | null> {
  await ensureDbUsersTable(client)

  const result = await client.query<ManagedDbUserAssignment>(
    `
      SELECT
        db_users.id,
        db_users.username,
        db_users.project_id,
        projects.name AS project_name,
        projects.schema_name
      FROM ${getQuotedDbUsersTableRef()} db_users
      LEFT JOIN ${getQuotedProjectsTableRef()} projects
        ON projects.id = db_users.project_id
      WHERE db_users.id = $1
      LIMIT 1
    `,
    [id]
  )

  return result.rows[0] ?? null
}

export async function usernameBelongsToAnotherDbUser(
  client: PoolClient,
  username: string,
  excludeId?: number
) {
  await ensureDbUsersTable(client)

  const result = await client.query<{ id: number }>(
    `
      SELECT id
      FROM ${getQuotedDbUsersTableRef()}
      WHERE lower(username) = lower($1)
        ${excludeId ? "AND id <> $2" : ""}
      LIMIT 1
    `,
    excludeId ? [username, excludeId] : [username]
  )

  return (result.rowCount ?? 0) > 0
}

export async function getProjectForManagedDbUser(
  client: PoolClient,
  id: number
) {
  await ensureDbUsersTable(client)

  const result = await client.query<{
    id: number
    name: string
    schema_name: string
  }>(
    `
      SELECT projects.id, projects.name, projects.schema_name
      FROM ${getQuotedDbUsersTableRef()} db_users
      INNER JOIN ${getQuotedProjectsTableRef()} projects
        ON projects.id = db_users.project_id
      WHERE db_users.id = $1
      LIMIT 1
    `,
    [id]
  )

  return result.rows[0] ?? null
}

export async function ensureManagedDbRole(
  client: PoolClient,
  username: string,
  password: string
) {
  const quotedRole = getQuotedRole(username)

  if (await roleExists(client, username)) {
    await client.query(
      `ALTER ROLE ${quotedRole} WITH LOGIN PASSWORD ${quoteLiteral(password)} NOCREATEDB NOCREATEROLE NOSUPERUSER NOREPLICATION NOBYPASSRLS INHERIT`
    )
    return
  }

  await client.query(
    `CREATE ROLE ${quotedRole} WITH LOGIN PASSWORD ${quoteLiteral(password)} NOCREATEDB NOCREATEROLE NOSUPERUSER NOREPLICATION NOBYPASSRLS INHERIT`
  )
}

export async function renameManagedDbRole(
  client: PoolClient,
  currentUsername: string,
  nextUsername: string
) {
  if (currentUsername === nextUsername) return
  await client.query(
    `ALTER ROLE ${getQuotedRole(currentUsername)} RENAME TO ${getQuotedRole(nextUsername)}`
  )
}

export async function updateManagedDbRolePassword(
  client: PoolClient,
  username: string,
  password: string
) {
  await client.query(
    `ALTER ROLE ${getQuotedRole(username)} WITH PASSWORD ${quoteLiteral(password)}`
  )
}

export async function dropManagedDbRole(client: PoolClient, username: string) {
  if (!(await roleExists(client, username))) {
    return
  }

  const quotedRole = getQuotedRole(username)
  const currentUserResult = await client.query<{ current_user: string }>(
    `SELECT current_user AS current_user`
  )
  const currentUser = currentUserResult.rows[0]?.current_user ?? ""
  if (currentUser && currentUser !== username) {
    await client.query(`REASSIGN OWNED BY ${quotedRole} TO ${getQuotedRole(currentUser)}`)
    await client.query(`DROP OWNED BY ${quotedRole}`)
  }
  await client.query(`DROP ROLE IF EXISTS ${quotedRole}`)
}

export async function syncManagedDbUserRoleById(client: PoolClient, id: number) {
  const record = await getManagedDbUserById(client, id)
  if (!record) {
    return
  }

  const roleName = record.username
  if (!(await roleExists(client, roleName))) {
    return
  }

  const managedSchemas = await listManagedSchemaNames(client)
  for (const schemaName of managedSchemas) {
    await revokeManagedSchemaPrivileges(client, roleName, schemaName)
  }

  const assignment = await getManagedDbUserAssignment(client, id)
  const assignedSchema = assignment?.schema_name ?? null
  if (assignedSchema) {
    await grantAssignedSchemaPrivileges(client, roleName, assignedSchema)
  }

  const databaseName = getDatabaseName(client)
  await client.query(
    `GRANT CONNECT ON DATABASE ${quotePgIdentifier(databaseName)} TO ${getQuotedRole(roleName)}`
  )
}

export async function syncAllManagedDbUsers(client: PoolClient) {
  const users = await listManagedDbUsers(client)
  for (const user of users) {
    await syncManagedDbUserRoleById(client, user.id)
  }
}

export async function listAccessibleProjectsForAdmin(client: PoolClient, adminId: number) {
  await ensureProjectsTable(client)

  const result = await client.query<{
    id: number
    name: string
    schema_name: string
  }>(
    `
      SELECT projects.id, projects.name, projects.schema_name
      FROM ${getQuotedProjectsTableRef()} projects
      LEFT JOIN ${getQuotedSchemaAccessTableRef()} schema_access
        ON schema_access.schema_name = projects.schema_name
      WHERE schema_access.superadmin_id IS NULL OR schema_access.superadmin_id = $1
      ORDER BY lower(projects.name), projects.id
    `,
    [adminId]
  )

  return result.rows
}

export async function authenticateManagedDbUser(
  username: string,
  password: string
) {
  const connection = getEffectiveParsed()
  const client = new Client({
    host: connection.host,
    port: Number(connection.port || "5432"),
    database: connection.database,
    user: username,
    password,
    connectionTimeoutMillis: 5000,
  })

  try {
    await client.connect()
    return true
  } catch {
    return false
  } finally {
    await client.end().catch(() => {})
  }
}

function quoteLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}
