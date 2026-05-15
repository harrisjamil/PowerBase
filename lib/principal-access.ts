import type { PoolClient } from "pg"
import type { PrincipalSession } from "@/lib/auth/principal-session"
import { getControlSchema, getQuotedProjectsTableRef } from "@/lib/control-schema"
import {
  canRoleAccessProjectSchema,
  ensureProjectsTable,
  getAccessibleProjectSchemaNamesForRole,
  getProjectRecordBySchemaName,
} from "@/lib/projects"

async function listNonProjectSchemaNames(client: PoolClient) {
  await ensureProjectsTable(client)

  const result = await client.query<{ schema_name: string }>(
    `
      SELECT n.nspname AS schema_name
      FROM pg_catalog.pg_namespace n
      LEFT JOIN ${getQuotedProjectsTableRef()} projects
        ON projects.schema_name = n.nspname
      WHERE n.nspname NOT LIKE 'pg_%'
        AND n.nspname <> 'information_schema'
        AND n.nspname NOT LIKE '%backup%'
        AND projects.id IS NULL
      ORDER BY n.nspname
    `
  )

  return new Set(result.rows.map((row) => row.schema_name))
}

export async function getEffectiveSuperadminIdForPrincipal(
  client: PoolClient,
  principal: PrincipalSession
) {
  if (principal.principalType === "superadmin") {
    return principal.id
  }

  return null
}

export async function getLinkedSuperadminForAgentPrincipal(
  client: PoolClient,
  principal: PrincipalSession
) {
  if (principal.principalType !== "db_user") {
    return null
  }

  return null
}

export async function getAccessibleSchemaNamesForPrincipal(
  client: PoolClient,
  principal: PrincipalSession
) {
  if (principal.principalType === "superadmin") {
    const accessibleSchemas = await listNonProjectSchemaNames(client)
    const projectSchemas = await getAccessibleProjectSchemaNamesForRole(client, principal.email)
    for (const schemaName of projectSchemas) {
      accessibleSchemas.add(schemaName)
    }
    accessibleSchemas.delete(getControlSchema())
    return accessibleSchemas
  }

  const accessibleSchemas = await getAccessibleProjectSchemaNamesForRole(client, principal.username)
  accessibleSchemas.delete(getControlSchema())
  return accessibleSchemas
}

export async function canPrincipalAccessSchema(
  client: PoolClient,
  principal: PrincipalSession,
  schemaName: string
) {
  if (schemaName === getControlSchema()) {
    return false
  }

  if (principal.principalType === "superadmin") {
    const project = await getProjectRecordBySchemaName(client, schemaName)
    if (!project) {
      return true
    }
    return canRoleAccessProjectSchema(client, principal.email, schemaName)
  }

  return canRoleAccessProjectSchema(client, principal.username, schemaName)
}
