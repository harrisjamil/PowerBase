import { Client, type PoolClient } from "pg"
import { ensureDbBootstrap } from "@/lib/db-bootstrap-cache"
import { getEffectiveParsed } from "@/lib/effective-database-url"
import { isSafePgIdentifier, quotePgIdentifier } from "@/lib/control-schema"

export const POWERBASE_ADMIN_ROLE = "powerbase_admin"

export type PostgresRoleRecord = {
  oid: number
  username: string
  can_login: boolean
  is_superuser: boolean
  can_create_db: boolean
  can_create_role: boolean
  inherits: boolean
  bypass_rls: boolean
  is_system_role: boolean
  is_admin: boolean
  granted_schemas: string[]
}

type PostgresRoleQueryRow = Omit<PostgresRoleRecord, "granted_schemas"> & {
  granted_schemas: string[] | string | null
}

function quoteRole(value: string) {
  return quotePgIdentifier(value)
}

function quoteLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`
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

function getPowerbaseAdminBootstrapKey(client: PoolClient) {
  const connection = getClientConnectionParameters(client)
  return [
    connection?.host || "",
    String(connection?.port || ""),
    connection?.database || "",
    "powerbase-admin-role",
  ].join("::")
}

function normalizeGrantedSchemas(value: string[] | string | null | undefined) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
  }
  if (typeof value !== "string") {
    return []
  }

  const trimmed = value.trim()
  if (!trimmed || trimmed === "{}") {
    return []
  }
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return [trimmed]
}

function normalizeRoleRecord(row: PostgresRoleQueryRow): PostgresRoleRecord {
  return {
    ...row,
    granted_schemas: normalizeGrantedSchemas(row.granted_schemas),
  }
}

export function readRoleName(value: unknown): string | null {
  if (typeof value !== "string") return null
  const roleName = value.trim()
  if (!roleName || !isSafePgIdentifier(roleName)) {
    return null
  }
  return roleName
}

export function readRolePassword(value: unknown): string | null {
  if (typeof value !== "string") return null
  if (!value || value.length > 512) return null
  return value
}

export function readRoleNames(value: unknown): string[] | null | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return null

  const deduped = new Set<string>()
  for (const item of value) {
    const roleName = readRoleName(item)
    if (!roleName) {
      return null
    }
    deduped.add(roleName)
  }

  return Array.from(deduped).sort((left, right) => left.localeCompare(right))
}

export function readSchemaNames(value: unknown): string[] | null | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return null

  const deduped = new Set<string>()
  for (const item of value) {
    if (typeof item !== "string") {
      return null
    }
    const schemaName = item.trim()
    if (!schemaName || !isSafePgIdentifier(schemaName)) {
      return null
    }
    deduped.add(schemaName)
  }

  return Array.from(deduped).sort((left, right) => left.localeCompare(right))
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

async function getDatabaseName(client: PoolClient) {
  const connection = getClientConnectionParameters(client)
  return connection?.database || getEffectiveParsed().database || "postgres"
}

export async function ensurePowerbaseAdminRole(client: PoolClient) {
  await ensureDbBootstrap(getPowerbaseAdminBootstrapKey(client), async () => {
    if (await roleExists(client, POWERBASE_ADMIN_ROLE)) {
      return
    }

    await client.query(`CREATE ROLE ${quoteRole(POWERBASE_ADMIN_ROLE)} NOLOGIN`)
  })
}

export async function listGrantableSchemas(client: PoolClient) {
  const result = await client.query<{ schema_name: string }>(
    `
      SELECT nspname AS schema_name
      FROM pg_catalog.pg_namespace
      WHERE nspname NOT LIKE 'pg_%'
        AND nspname <> 'information_schema'
        AND nspname NOT LIKE '%backup%'
      ORDER BY nspname
    `
  )

  return result.rows.map((row) => row.schema_name)
}

export async function listPostgresRoles(client: PoolClient): Promise<PostgresRoleRecord[]> {
  await ensurePowerbaseAdminRole(client)

  const result = await client.query<PostgresRoleQueryRow>(
    `
      SELECT
        roles.oid::int AS oid,
        roles.rolname AS username,
        roles.rolcanlogin AS can_login,
        roles.rolsuper AS is_superuser,
        roles.rolcreatedb AS can_create_db,
        roles.rolcreaterole AS can_create_role,
        roles.rolinherit AS inherits,
        roles.rolbypassrls AS bypass_rls,
        (roles.rolname = 'postgres' OR roles.rolname LIKE 'pg_%') AS is_system_role,
        pg_has_role(roles.rolname, $1, 'member') AS is_admin,
        COALESCE((
          SELECT array_agg(namespaces.nspname ORDER BY namespaces.nspname)
          FROM pg_catalog.pg_namespace namespaces
          WHERE namespaces.nspname NOT LIKE 'pg_%'
            AND namespaces.nspname <> 'information_schema'
            AND namespaces.nspname NOT LIKE '%backup%'
            AND has_schema_privilege(roles.rolname, namespaces.nspname, 'USAGE')
        ), ARRAY[]::text[]) AS granted_schemas
      FROM pg_catalog.pg_roles roles
      ORDER BY lower(roles.rolname), roles.oid
    `,
    [POWERBASE_ADMIN_ROLE]
  )

  return result.rows.map(normalizeRoleRecord)
}

export async function getPostgresRoleByOid(
  client: PoolClient,
  oid: number
): Promise<PostgresRoleRecord | null> {
  await ensurePowerbaseAdminRole(client)

  const result = await client.query<PostgresRoleQueryRow>(
    `
      SELECT
        roles.oid::int AS oid,
        roles.rolname AS username,
        roles.rolcanlogin AS can_login,
        roles.rolsuper AS is_superuser,
        roles.rolcreatedb AS can_create_db,
        roles.rolcreaterole AS can_create_role,
        roles.rolinherit AS inherits,
        roles.rolbypassrls AS bypass_rls,
        (roles.rolname = 'postgres' OR roles.rolname LIKE 'pg_%') AS is_system_role,
        pg_has_role(roles.rolname, $1, 'member') AS is_admin,
        COALESCE((
          SELECT array_agg(namespaces.nspname ORDER BY namespaces.nspname)
          FROM pg_catalog.pg_namespace namespaces
          WHERE namespaces.nspname NOT LIKE 'pg_%'
            AND namespaces.nspname <> 'information_schema'
            AND namespaces.nspname NOT LIKE '%backup%'
            AND has_schema_privilege(roles.rolname, namespaces.nspname, 'USAGE')
        ), ARRAY[]::text[]) AS granted_schemas
      FROM pg_catalog.pg_roles roles
      WHERE roles.oid = $2
      LIMIT 1
    `,
    [POWERBASE_ADMIN_ROLE, oid]
  )

  const row = result.rows[0]
  return row ? normalizeRoleRecord(row) : null
}

export async function getPostgresRoleByName(
  client: PoolClient,
  roleName: string
): Promise<PostgresRoleRecord | null> {
  await ensurePowerbaseAdminRole(client)

  const result = await client.query<PostgresRoleQueryRow>(
    `
      SELECT
        roles.oid::int AS oid,
        roles.rolname AS username,
        roles.rolcanlogin AS can_login,
        roles.rolsuper AS is_superuser,
        roles.rolcreatedb AS can_create_db,
        roles.rolcreaterole AS can_create_role,
        roles.rolinherit AS inherits,
        roles.rolbypassrls AS bypass_rls,
        (roles.rolname = 'postgres' OR roles.rolname LIKE 'pg_%') AS is_system_role,
        pg_has_role(roles.rolname, $1, 'member') AS is_admin,
        COALESCE((
          SELECT array_agg(namespaces.nspname ORDER BY namespaces.nspname)
          FROM pg_catalog.pg_namespace namespaces
          WHERE namespaces.nspname NOT LIKE 'pg_%'
            AND namespaces.nspname <> 'information_schema'
            AND namespaces.nspname NOT LIKE '%backup%'
            AND has_schema_privilege(roles.rolname, namespaces.nspname, 'USAGE')
        ), ARRAY[]::text[]) AS granted_schemas
      FROM pg_catalog.pg_roles roles
      WHERE lower(roles.rolname) = lower($2)
      LIMIT 1
    `,
    [POWERBASE_ADMIN_ROLE, roleName]
  )

  const row = result.rows[0]
  return row ? normalizeRoleRecord(row) : null
}

export async function countAdminMembers(client: PoolClient) {
  await ensurePowerbaseAdminRole(client)

  const result = await client.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM pg_catalog.pg_auth_members members
      INNER JOIN pg_catalog.pg_roles admin_role
        ON admin_role.oid = members.roleid
      WHERE admin_role.rolname = $1
    `,
    [POWERBASE_ADMIN_ROLE]
  )

  return Number(result.rows[0]?.count ?? "0")
}

export async function roleCanAccessAdmin(
  client: PoolClient,
  roleName: string
) {
  await ensurePowerbaseAdminRole(client)

  const memberCheck = await client.query<{ allowed: boolean }>(
    `SELECT pg_has_role($1, $2, 'member') AS allowed`,
    [roleName, POWERBASE_ADMIN_ROLE]
  )
  if (memberCheck.rows[0]?.allowed) {
    return true
  }

  const adminMembers = await countAdminMembers(client)
  if (adminMembers > 0) {
    return false
  }

  const role = await getPostgresRoleByName(client, roleName)
  return Boolean(role?.is_superuser)
}

async function revokeSchemaPrivileges(client: PoolClient, roleName: string, schemaName: string) {
  const quotedSchema = quotePgIdentifier(schemaName)
  const quotedRole = quoteRole(roleName)

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

async function grantSchemaPrivileges(client: PoolClient, roleName: string, schemaName: string) {
  const quotedSchema = quotePgIdentifier(schemaName)
  const quotedRole = quoteRole(roleName)

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

async function ensureRoleDatabaseConnect(client: PoolClient, roleName: string) {
  const databaseName = await getDatabaseName(client)
  await client.query(
    `GRANT CONNECT ON DATABASE ${quotePgIdentifier(databaseName)} TO ${quoteRole(roleName)}`
  )
}

export async function listMissingPostgresRoleNames(client: PoolClient, roleNames: string[]) {
  const normalizedRoleNames = Array.from(
    new Set(roleNames.map((roleName) => roleName.trim()).filter(Boolean))
  )
  if (normalizedRoleNames.length === 0) {
    return []
  }

  const result = await client.query<{ rolname: string }>(
    `
      SELECT rolname
      FROM pg_catalog.pg_roles
      WHERE rolname = ANY($1::text[])
    `,
    [normalizedRoleNames]
  )

  const existingRoles = new Set(result.rows.map((row) => row.rolname))
  return normalizedRoleNames.filter((roleName) => !existingRoles.has(roleName))
}

export async function revokeSchemaPrivilegesFromRole(
  client: PoolClient,
  roleName: string,
  schemaName: string
) {
  await revokeSchemaPrivileges(client, roleName, schemaName)
}

export async function grantSchemaPrivilegesToRole(
  client: PoolClient,
  roleName: string,
  schemaName: string
) {
  await grantSchemaPrivileges(client, roleName, schemaName)
  await ensureRoleDatabaseConnect(client, roleName)
}

export async function syncProjectRoleSchemaAccess(
  client: PoolClient,
  schemaName: string,
  previousRoleNames: string[],
  nextRoleNames: string[]
) {
  const { canPgUserAccessProjectSchema } = await import("@/lib/teams")
  const previous = new Set(previousRoleNames.map((roleName) => roleName.trim()).filter(Boolean))
  const next = new Set(nextRoleNames.map((roleName) => roleName.trim()).filter(Boolean))
  const allRoleNames = new Set([...previous, ...next])

  for (const roleName of allRoleNames) {
    if (next.has(roleName)) {
      await grantSchemaPrivilegesToRole(client, roleName, schemaName)
      continue
    }

    const stillHasAccess = await canPgUserAccessProjectSchema(client, roleName, schemaName)
    if (!stillHasAccess) {
      await revokeSchemaPrivilegesFromRole(client, roleName, schemaName)
    }
  }
}

async function syncSchemaPrivileges(
  client: PoolClient,
  roleName: string,
  schemaNames: string[]
) {
  const grantableSchemas = await listGrantableSchemas(client)
  const selectedSchemas = new Set(schemaNames)

  for (const schemaName of grantableSchemas) {
    await revokeSchemaPrivileges(client, roleName, schemaName)
    if (selectedSchemas.has(schemaName)) {
      await grantSchemaPrivileges(client, roleName, schemaName)
    }
  }
}

async function syncAdminMembership(
  client: PoolClient,
  roleName: string,
  isAdmin: boolean
) {
  await ensurePowerbaseAdminRole(client)
  if (isAdmin) {
    await client.query(
      `GRANT ${quoteRole(POWERBASE_ADMIN_ROLE)} TO ${quoteRole(roleName)}`
    )
    return
  }

  await client.query(
    `REVOKE ${quoteRole(POWERBASE_ADMIN_ROLE)} FROM ${quoteRole(roleName)}`
  )
}

function buildRoleAttributes(input: {
  canLogin: boolean
  isSuperuser: boolean
  canCreateDb: boolean
  canCreateRole: boolean
}) {
  return [
    input.canLogin ? "LOGIN" : "NOLOGIN",
    input.isSuperuser ? "SUPERUSER" : "NOSUPERUSER",
    input.canCreateDb ? "CREATEDB" : "NOCREATEDB",
    input.canCreateRole ? "CREATEROLE" : "NOCREATEROLE",
    "NOREPLICATION",
    "NOBYPASSRLS",
    "INHERIT",
  ].join(" ")
}

export async function createPostgresRole(
  client: PoolClient,
  input: {
    username: string
    password: string
    canLogin: boolean
    isAdmin: boolean
    isSuperuser: boolean
    canCreateDb: boolean
    canCreateRole: boolean
    schemaNames: string[]
  }
) {
  await ensurePowerbaseAdminRole(client)

  const quotedRole = quoteRole(input.username)
  const attributes = buildRoleAttributes({
    canLogin: input.canLogin,
    isSuperuser: input.isSuperuser,
    canCreateDb: input.canCreateDb,
    canCreateRole: input.canCreateRole,
  })

  await client.query(
    `CREATE ROLE ${quotedRole} WITH ${attributes} PASSWORD ${quoteLiteral(input.password)}`
  )
  await syncAdminMembership(client, input.username, input.isAdmin)
  await syncSchemaPrivileges(client, input.username, input.schemaNames)
  await ensureRoleDatabaseConnect(client, input.username)
}

export async function updatePostgresRole(
  client: PoolClient,
  currentRoleName: string,
  input: {
    nextUsername: string
    password?: string | null
    canLogin: boolean
    isAdmin: boolean
    isSuperuser: boolean
    canCreateDb: boolean
    canCreateRole: boolean
    schemaNames: string[]
  }
) {
  const nextRoleName = input.nextUsername
  if (currentRoleName !== nextRoleName) {
    await client.query(
      `ALTER ROLE ${quoteRole(currentRoleName)} RENAME TO ${quoteRole(nextRoleName)}`
    )
  }

  const attributes = buildRoleAttributes({
    canLogin: input.canLogin,
    isSuperuser: input.isSuperuser,
    canCreateDb: input.canCreateDb,
    canCreateRole: input.canCreateRole,
  })

  await client.query(`ALTER ROLE ${quoteRole(nextRoleName)} WITH ${attributes}`)
  if (input.password) {
    await client.query(
      `ALTER ROLE ${quoteRole(nextRoleName)} WITH PASSWORD ${quoteLiteral(input.password)}`
    )
  }

  await syncAdminMembership(client, nextRoleName, input.isAdmin)
  await syncSchemaPrivileges(client, nextRoleName, input.schemaNames)
  await ensureRoleDatabaseConnect(client, nextRoleName)
}

export async function dropPostgresRole(client: PoolClient, roleName: string) {
  if (!(await roleExists(client, roleName))) {
    return
  }

  const quotedRole = quoteRole(roleName)
  const currentUserResult = await client.query<{ current_user: string }>(
    `SELECT current_user AS current_user`
  )
  const currentUser = currentUserResult.rows[0]?.current_user ?? ""
  if (currentUser && currentUser !== roleName) {
    await client.query(`REASSIGN OWNED BY ${quotedRole} TO ${quoteRole(currentUser)}`)
    await client.query(`DROP OWNED BY ${quotedRole}`)
  }
  await client.query(`DROP ROLE IF EXISTS ${quotedRole}`)
}

export async function authenticatePostgresRole(
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
