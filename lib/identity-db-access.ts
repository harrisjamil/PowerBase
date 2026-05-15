import type { PoolClient } from "pg"
import { ensureAgentsTable } from "@/lib/agents"
import {
  getControlSchema,
  getQuotedAgentsTableRef,
  getQuotedControlTableRef,
  quotePgIdentifier,
} from "@/lib/control-schema"
import { getAccessibleSchemaNames } from "@/lib/schema-access"

type SuperadminIdentity = {
  id: number
  email: string
}

type AgentIdentity = {
  id: number
  email: string
  superadmin_id: number | null
  superadmin_email: string | null
}

type LegacyMappingRow = {
  agent_id: number
  superadmin_ids: number[] | null
}

export type IdentityDbUser = {
  username: string
  principal_type: "superadmin" | "agent"
  principal_id: number
  principal_email: string
  inherited_superadmin_id: number | null
  inherited_superadmin_email: string | null
}

function quoteRole(value: string) {
  return quotePgIdentifier(value)
}

function getQuotedLegacyConsumerAgentsTableRef() {
  return `${quotePgIdentifier(getControlSchema())}.${quotePgIdentifier("consumer_agents")}`
}

function getQuotedLegacyConsumerSuperadminsTableRef() {
  return `${quotePgIdentifier(getControlSchema())}.${quotePgIdentifier("consumer_superadmins")}`
}

export function getSuperadminDbRoleName(id: number) {
  return `sa_${id}`
}

export function getAgentDbRoleName(id: number) {
  return `ag_${id}`
}

async function tableExists(client: PoolClient, tableRef: string) {
  const result = await client.query<{ exists: string | null }>(
    `SELECT to_regclass($1) AS exists`,
    [tableRef.replace(/"/g, "")]
  )
  return Boolean(result.rows[0]?.exists)
}

export async function ensureIdentityAccessModel(client: PoolClient) {
  await ensureAgentsTable(client)
  await migrateLegacyConsumerAssignments(client)
}

export async function migrateLegacyConsumerAssignments(client: PoolClient) {
  const consumerAgentsRef = getQuotedLegacyConsumerAgentsTableRef()
  const consumerSuperadminsRef = getQuotedLegacyConsumerSuperadminsTableRef()

  const hasConsumerAgents = await tableExists(client, consumerAgentsRef)
  const hasConsumerSuperadmins = await tableExists(client, consumerSuperadminsRef)

  if (!hasConsumerAgents || !hasConsumerSuperadmins) {
    return
  }

  const result = await client.query<LegacyMappingRow>(`
    SELECT
      consumer_agents.agent_id,
      array_agg(DISTINCT consumer_superadmins.superadmin_id)
        FILTER (WHERE consumer_superadmins.superadmin_id IS NOT NULL) AS superadmin_ids
    FROM ${consumerAgentsRef} consumer_agents
    LEFT JOIN ${consumerSuperadminsRef} consumer_superadmins
      ON consumer_superadmins.consumer_username = consumer_agents.consumer_username
    GROUP BY consumer_agents.agent_id
  `)

  for (const row of result.rows) {
    const superadminIds = (row.superadmin_ids ?? []).filter((value) =>
      Number.isInteger(value) && value > 0
    )
    if (superadminIds.length !== 1) {
      continue
    }

    await client.query(
      `
        UPDATE ${getQuotedAgentsTableRef()}
        SET superadmin_id = COALESCE(superadmin_id, $2)
        WHERE id = $1
      `,
      [row.agent_id, superadminIds[0]]
    )
  }
}

export async function getAgentSuperadminId(client: PoolClient, agentId: number) {
  await ensureIdentityAccessModel(client)

  const result = await client.query<{ superadmin_id: number | null }>(
    `
      SELECT superadmin_id
      FROM ${getQuotedAgentsTableRef()}
      WHERE id = $1
      LIMIT 1
    `,
    [agentId]
  )

  return result.rows[0]?.superadmin_id ?? null
}

export async function getAgentLinkedSuperadmin(
  client: PoolClient,
  agentId: number
): Promise<SuperadminIdentity | null> {
  await ensureIdentityAccessModel(client)

  const result = await client.query<SuperadminIdentity>(
    `
      SELECT superadmins.id, superadmins.email
      FROM ${getQuotedAgentsTableRef()} agents
      INNER JOIN ${getQuotedControlTableRef()} superadmins
        ON superadmins.id = agents.superadmin_id
      WHERE agents.id = $1
      LIMIT 1
    `,
    [agentId]
  )

  return result.rows[0] ?? null
}

export async function listSuperadminIdentities(client: PoolClient) {
  const result = await client.query<SuperadminIdentity>(
    `
      SELECT id, email
      FROM ${getQuotedControlTableRef()}
      ORDER BY lower(email), id
    `
  )

  return result.rows
}

export async function listAgentIdentities(client: PoolClient) {
  await ensureIdentityAccessModel(client)

  const result = await client.query<AgentIdentity>(
    `
      SELECT
        agents.id,
        agents.email,
        agents.superadmin_id,
        superadmins.email AS superadmin_email
      FROM ${getQuotedAgentsTableRef()} agents
      LEFT JOIN ${getQuotedControlTableRef()} superadmins
        ON superadmins.id = agents.superadmin_id
      ORDER BY lower(agents.email), agents.id
    `
  )

  return result.rows
}

export async function listIdentityDbUsers(client: PoolClient): Promise<IdentityDbUser[]> {
  const superadmins = await listSuperadminIdentities(client)
  const agents = await listAgentIdentities(client)

  return [
    ...superadmins.map((superadmin) => ({
      username: getSuperadminDbRoleName(superadmin.id),
      principal_type: "superadmin" as const,
      principal_id: superadmin.id,
      principal_email: superadmin.email,
      inherited_superadmin_id: null,
      inherited_superadmin_email: null,
    })),
    ...agents.map((agent) => ({
      username: getAgentDbRoleName(agent.id),
      principal_type: "agent" as const,
      principal_id: agent.id,
      principal_email: agent.email,
      inherited_superadmin_id: agent.superadmin_id,
      inherited_superadmin_email: agent.superadmin_email,
    })),
  ]
}

async function roleExists(client: PoolClient, roleName: string) {
  const result = await client.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM pg_roles
        WHERE rolname = $1
      ) AS exists
    `,
    [roleName]
  )

  return Boolean(result.rows[0]?.exists)
}

async function ensureRole(client: PoolClient, roleName: string) {
  if (await roleExists(client, roleName)) {
    return
  }

  await client.query(`CREATE ROLE ${quoteRole(roleName)} NOLOGIN`)
}

async function listManagedSchemaNames(client: PoolClient) {
  const result = await client.query<{ schema_name: string }>(
    `
      SELECT nspname AS schema_name
      FROM pg_catalog.pg_namespace
      WHERE nspname NOT LIKE 'pg_%'
        AND nspname != 'information_schema'
        AND nspname NOT LIKE '%backup%'
        AND nspname <> $1
      ORDER BY nspname
    `,
    [getControlSchema()]
  )

  return result.rows.map((row) => row.schema_name)
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

async function grantSuperadminSchemaPrivileges(client: PoolClient, roleName: string, schemaName: string) {
  const quotedSchema = quotePgIdentifier(schemaName)
  const quotedRole = quoteRole(roleName)

  await client.query(`GRANT USAGE, CREATE ON SCHEMA ${quotedSchema} TO ${quotedRole}`)
  await client.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${quotedSchema} TO ${quotedRole}`)
  await client.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ${quotedSchema} TO ${quotedRole}`)
  await client.query(`GRANT ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA ${quotedSchema} TO ${quotedRole}`)

  await client.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${quotedSchema} GRANT ALL PRIVILEGES ON TABLES TO ${quotedRole}`
  )
  await client.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${quotedSchema} GRANT ALL PRIVILEGES ON SEQUENCES TO ${quotedRole}`
  )
  await client.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${quotedSchema} GRANT ALL PRIVILEGES ON ROUTINES TO ${quotedRole}`
  )
}

async function grantAgentSchemaPrivileges(client: PoolClient, roleName: string, schemaName: string) {
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

async function syncRoleSchemaPrivileges(
  client: PoolClient,
  roleName: string,
  allowedSchemas: Set<string>,
  principalType: "superadmin" | "agent"
) {
  const managedSchemas = await listManagedSchemaNames(client)

  for (const schemaName of managedSchemas) {
    await revokeSchemaPrivileges(client, roleName, schemaName)

    if (!allowedSchemas.has(schemaName)) {
      continue
    }

    if (principalType === "superadmin") {
      await grantSuperadminSchemaPrivileges(client, roleName, schemaName)
    } else {
      await grantAgentSchemaPrivileges(client, roleName, schemaName)
    }
  }
}

export async function syncSuperadminDbRole(client: PoolClient, superadminId: number) {
  const roleName = getSuperadminDbRoleName(superadminId)
  await ensureRole(client, roleName)
  await client.query(
    `ALTER ROLE ${quoteRole(roleName)} NOLOGIN CREATEDB CREATEROLE NOSUPERUSER NOREPLICATION NOBYPASSRLS INHERIT`
  )

  const allowedSchemas = await getAccessibleSchemaNames(client, superadminId)
  allowedSchemas.delete(getControlSchema())
  await syncRoleSchemaPrivileges(client, roleName, allowedSchemas, "superadmin")
}

export async function syncAgentDbRole(client: PoolClient, agentId: number, superadminId: number | null) {
  const roleName = getAgentDbRoleName(agentId)
  await ensureRole(client, roleName)
  await client.query(
    `ALTER ROLE ${quoteRole(roleName)} NOLOGIN NOCREATEDB NOCREATEROLE NOSUPERUSER NOREPLICATION NOBYPASSRLS INHERIT`
  )

  const allowedSchemas =
    superadminId === null ? new Set<string>() : await getAccessibleSchemaNames(client, superadminId)
  allowedSchemas.delete(getControlSchema())
  await syncRoleSchemaPrivileges(client, roleName, allowedSchemas, "agent")
}

export async function syncAllIdentityDbRoles(client: PoolClient) {
  await ensureIdentityAccessModel(client)

  const superadmins = await listSuperadminIdentities(client)
  const agents = await listAgentIdentities(client)

  for (const superadmin of superadmins) {
    await syncSuperadminDbRole(client, superadmin.id)
  }

  for (const agent of agents) {
    await syncAgentDbRole(client, agent.id, agent.superadmin_id)
  }
}

export async function dropIdentityDbRole(client: PoolClient, roleName: string) {
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
