import type { PoolClient } from "pg"
import type { PrincipalSession } from "@/lib/auth/principal-session"
import {
  getControlSchema,
  getQuotedProjectsTableRef,
  isControlSchema,
} from "@/lib/control-schema"
import {
  canRoleAccessProjectSchema,
  ensureProjectsTable,
  getAccessibleProjectSchemaNamesForRole,
  getProjectRecordBySchemaName,
} from "@/lib/projects"
import {
  canPgUserAccessProjectSchema,
  getAccessibleProjectSchemaNamesForPgUser,
} from "@/lib/teams"

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

function canPrincipalAccessControlSchema(principal: PrincipalSession): boolean {
  // Admin UI sessions (PowerBuddy login) may browse platform metadata tables.
  return principal.principalType === "superadmin"
}

export async function getAccessibleSchemaNamesForPrincipal(
  client: PoolClient,
  principal: PrincipalSession
) {
  const controlSchema = getControlSchema()

  if (principal.principalType === "superadmin") {
    const accessibleSchemas = await listNonProjectSchemaNames(client)
    const projectSchemas = await getAccessibleProjectSchemaNamesForRole(client, principal.email)
    for (const schemaName of projectSchemas) {
      accessibleSchemas.add(schemaName)
    }
    if (canPrincipalAccessControlSchema(principal)) {
      accessibleSchemas.add(controlSchema)
    } else {
      accessibleSchemas.delete(controlSchema)
    }
    return accessibleSchemas
  }

  const accessibleSchemas = await getAccessibleProjectSchemaNamesForPgUser(
    client,
    principal.username
  )
  accessibleSchemas.delete(controlSchema)
  return accessibleSchemas
}

export async function canPrincipalAccessSchema(
  client: PoolClient,
  principal: PrincipalSession,
  schemaName: string
) {
  if (isControlSchema(schemaName)) {
    return canPrincipalAccessControlSchema(principal)
  }

  if (principal.principalType === "superadmin") {
    const project = await getProjectRecordBySchemaName(client, schemaName)
    if (!project) {
      return true
    }
    return canRoleAccessProjectSchema(client, principal.email, schemaName)
  }

  return canPgUserAccessProjectSchema(client, principal.username, schemaName)
}

function getPrincipalRoleName(principal: PrincipalSession): string {
  return principal.principalType === "superadmin" ? principal.email : principal.username
}

export function canPrincipalManageProject(
  principal: PrincipalSession,
  creatorRoleName: string | null
): boolean {
  if (principal.principalType === "superadmin") {
    return true
  }
  if (!creatorRoleName) {
    return false
  }
  return creatorRoleName.toLowerCase() === getPrincipalRoleName(principal).toLowerCase()
}
