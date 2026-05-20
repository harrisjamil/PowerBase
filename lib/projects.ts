import type { PoolClient } from "pg"
import {
  PROJECTS_TABLE_NAME,
  ensureControlSchema,
  getControlSchema,
  getQuotedProjectsTableRef,
  isSafePgIdentifier,
  quotePgIdentifier,
} from "@/lib/control-schema"
import { ensureDbBootstrap } from "@/lib/db-bootstrap-cache"
import { allocateUniqueProjectRef, parseProjectLookup } from "@/lib/project-ref"
import { buildProjectSchemaName } from "@/lib/project-names"
import { ensureProjectApiKeys } from "@/lib/project-api-keys"

export const PROJECT_ROLE_ASSIGNMENTS_TABLE_NAME = "project_role_assignments"

export type ProjectRecord = {
  id: number
  project_ref: string
  name: string
  schema_name: string
  description: string | null
  owner_superadmin_id: number | null
  creator_role_name: string | null
  status: string
  created_at: string | null
  updated_at: string | null
}

const PROJECT_RECORD_COLUMNS = `
  id,
  project_ref,
  name,
  schema_name,
  description,
  owner_superadmin_id,
  creator_role_name,
  status,
  created_at::text,
  updated_at::text
`

export type ProjectRoleAssignment = {
  project_id: number
  role_name: string
  created_at: string | null
  updated_at: string | null
}

export type RoleProjectAssignment = {
  project_id: number
  project_name: string
  schema_name: string
  description: string | null
  creator_role_name: string | null
}

function getProjectBootstrapKey(client: PoolClient, suffix: string) {
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
    suffix,
  ].join("::")
}

export function getQuotedProjectRoleAssignmentsTableRef() {
  return `${quotePgIdentifier(getControlSchema())}.${quotePgIdentifier(PROJECT_ROLE_ASSIGNMENTS_TABLE_NAME)}`
}

function normalizeRoleNames(roleNames: string[], creatorRoleName?: string | null) {
  const normalized = new Set<string>()

  for (const roleName of roleNames) {
    const value = roleName.trim()
    if (value && isSafePgIdentifier(value)) {
      normalized.add(value)
    }
  }

  if (creatorRoleName) {
    const creator = creatorRoleName.trim()
    if (creator && isSafePgIdentifier(creator)) {
      normalized.add(creator)
    }
  }

  return Array.from(normalized).sort((left, right) => left.localeCompare(right))
}

export async function ensureProjectsTable(client: PoolClient) {
  await ensureDbBootstrap(getProjectBootstrapKey(client, "projects"), async () => {
    await ensureControlSchema(client)

    const tableRef = getQuotedProjectsTableRef()

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${tableRef} (
        id serial PRIMARY KEY,
        name text NOT NULL,
        schema_name text NOT NULL UNIQUE,
        description text NULL,
        owner_superadmin_id integer NULL,
        creator_role_name text NULL,
        status text NOT NULL DEFAULT 'active',
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `)

    await client.query(
      `ALTER TABLE ${tableRef} ADD COLUMN IF NOT EXISTS creator_role_name text NULL`
    )

    await client.query(`
      CREATE INDEX IF NOT EXISTS ${quotePgIdentifier(`${PROJECTS_TABLE_NAME}_owner_superadmin_idx`)}
      ON ${tableRef} (owner_superadmin_id)
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS ${quotePgIdentifier(`${PROJECTS_TABLE_NAME}_creator_role_idx`)}
      ON ${tableRef} (creator_role_name)
    `)

    await client.query(
      `ALTER TABLE ${tableRef} ADD COLUMN IF NOT EXISTS project_ref text NULL`
    )

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ${quotePgIdentifier(`${PROJECTS_TABLE_NAME}_project_ref_idx`)}
      ON ${tableRef} (project_ref)
      WHERE project_ref IS NOT NULL
    `)

    await backfillMissingProjectRefs(client)
  })
}

async function backfillMissingProjectRefs(client: PoolClient) {
  const tableRef = getQuotedProjectsTableRef()
  const missing = await client.query<{ id: number }>(
    `
      SELECT id
      FROM ${tableRef}
      WHERE project_ref IS NULL
      ORDER BY id
    `
  )

  for (const row of missing.rows) {
    const projectRef = await allocateUniqueProjectRef(client)
    await client.query(
      `
        UPDATE ${tableRef}
        SET project_ref = $2,
            updated_at = now()
        WHERE id = $1
          AND project_ref IS NULL
      `,
      [row.id, projectRef]
    )
  }
}

export async function ensureProjectRoleAssignmentsTable(client: PoolClient) {
  await ensureProjectsTable(client)

  await ensureDbBootstrap(getProjectBootstrapKey(client, "project-role-assignments"), async () => {
    const tableRef = getQuotedProjectRoleAssignmentsTableRef()
    const projectsRef = getQuotedProjectsTableRef()

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${tableRef} (
        project_id integer NOT NULL REFERENCES ${projectsRef} (id) ON DELETE CASCADE,
        role_name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (project_id, role_name)
      )
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS ${quotePgIdentifier(`${PROJECT_ROLE_ASSIGNMENTS_TABLE_NAME}_role_name_idx`)}
      ON ${tableRef} (role_name)
    `)
  })
}

export async function upsertProjectRecord(
  client: PoolClient,
  input: {
    name: string
    schemaName: string
    description: string | null
    ownerSuperadminId?: number | null
    creatorRoleName?: string | null
    status?: string
  }
) {
  await ensureProjectsTable(client)

  const projectRef = await allocateUniqueProjectRef(client)

  const result = await client.query<ProjectRecord>(
    `
      INSERT INTO ${getQuotedProjectsTableRef()} (
        project_ref,
        name,
        schema_name,
        description,
        owner_superadmin_id,
        creator_role_name,
        status,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'active'), now(), now())
      ON CONFLICT (schema_name)
      DO UPDATE
      SET name = EXCLUDED.name,
          description = EXCLUDED.description,
          owner_superadmin_id = EXCLUDED.owner_superadmin_id,
          creator_role_name = COALESCE(EXCLUDED.creator_role_name, ${getQuotedProjectsTableRef()}.creator_role_name),
          status = EXCLUDED.status,
          updated_at = now()
      RETURNING ${PROJECT_RECORD_COLUMNS}
    `,
    [
      projectRef,
      input.name,
      input.schemaName,
      input.description,
      input.ownerSuperadminId ?? null,
      input.creatorRoleName ?? null,
      input.status ?? "active",
    ]
  )

  const project = result.rows[0]
  if (project) {
    await ensureProjectApiKeys(client, project.id, project.project_ref)
  }

  return project
}

export async function getProjectRecordBySchemaName(client: PoolClient, schemaName: string) {
  await ensureProjectsTable(client)

  const result = await client.query<ProjectRecord>(
    `
      SELECT ${PROJECT_RECORD_COLUMNS}
      FROM ${getQuotedProjectsTableRef()}
      WHERE schema_name = $1
      LIMIT 1
    `,
    [schemaName]
  )

  return result.rows[0] ?? null
}

export async function getProjectRecordById(client: PoolClient, id: number) {
  await ensureProjectsTable(client)

  const result = await client.query<ProjectRecord>(
    `
      SELECT ${PROJECT_RECORD_COLUMNS}
      FROM ${getQuotedProjectsTableRef()}
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  )

  return result.rows[0] ?? null
}

export async function getProjectRecordByRef(client: PoolClient, projectRef: string) {
  await ensureProjectsTable(client)

  const result = await client.query<ProjectRecord>(
    `
      SELECT ${PROJECT_RECORD_COLUMNS}
      FROM ${getQuotedProjectsTableRef()}
      WHERE project_ref = $1
      LIMIT 1
    `,
    [projectRef]
  )

  return result.rows[0] ?? null
}

export async function getProjectRecordByLookup(client: PoolClient, lookup: string) {
  const parsed = parseProjectLookup(lookup)
  if (!parsed) return null

  if (parsed.type === "id") {
    return getProjectRecordById(client, parsed.id)
  }

  return getProjectRecordByRef(client, parsed.ref)
}

export async function renameProjectRecord(
  client: PoolClient,
  oldSchemaName: string,
  next: {
    schemaName: string
    name?: string
    description?: string | null
    ownerSuperadminId?: number | null
    creatorRoleName?: string | null
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
    nextIndex += 1
  }
  if (next.creatorRoleName !== undefined) {
    assignments.push(`creator_role_name = $${nextIndex}`)
    values.push(next.creatorRoleName)
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

export async function listProjectRoleAssignments(client: PoolClient, projectId: number) {
  await ensureProjectRoleAssignmentsTable(client)

  const result = await client.query<{ role_name: string }>(
    `
      SELECT role_name
      FROM ${getQuotedProjectRoleAssignmentsTableRef()}
      WHERE project_id = $1
      ORDER BY lower(role_name), role_name
    `,
    [projectId]
  )

  return result.rows.map((row) => row.role_name)
}

export async function listProjectRoleAssignmentsBySchemaName(client: PoolClient, schemaName: string) {
  await ensureProjectRoleAssignmentsTable(client)

  const result = await client.query<{ role_name: string }>(
    `
      SELECT assignments.role_name
      FROM ${getQuotedProjectRoleAssignmentsTableRef()} assignments
      INNER JOIN ${getQuotedProjectsTableRef()} projects
        ON projects.id = assignments.project_id
      WHERE projects.schema_name = $1
      ORDER BY lower(assignments.role_name), assignments.role_name
    `,
    [schemaName]
  )

  return result.rows.map((row) => row.role_name)
}

export async function replaceProjectRoleAssignments(
  client: PoolClient,
  projectId: number,
  roleNames: string[],
  creatorRoleName?: string | null
) {
  await ensureProjectRoleAssignmentsTable(client)

  const normalizedRoleNames = normalizeRoleNames(roleNames, creatorRoleName)
  await client.query(
    `DELETE FROM ${getQuotedProjectRoleAssignmentsTableRef()} WHERE project_id = $1`,
    [projectId]
  )

  if (normalizedRoleNames.length > 0) {
    await client.query(
      `
        INSERT INTO ${getQuotedProjectRoleAssignmentsTableRef()} (
          project_id,
          role_name,
          created_at,
          updated_at
        )
        SELECT
          $1,
          role_name,
          now(),
          now()
        FROM unnest($2::text[]) AS role_name
      `,
      [projectId, normalizedRoleNames]
    )
  }

  return normalizedRoleNames
}

export async function listRoleProjectAssignments(client: PoolClient, roleName: string) {
  await ensureProjectRoleAssignmentsTable(client)

  const result = await client.query<RoleProjectAssignment>(
    `
      SELECT DISTINCT
        projects.id AS project_id,
        projects.name AS project_name,
        projects.schema_name,
        projects.description,
        projects.creator_role_name
      FROM ${getQuotedProjectsTableRef()} projects
      LEFT JOIN ${getQuotedProjectRoleAssignmentsTableRef()} assignments
        ON assignments.project_id = projects.id
      WHERE lower(projects.creator_role_name) = lower($1)
         OR lower(assignments.role_name) = lower($1)
      ORDER BY projects.name, projects.id
    `,
    [roleName]
  )

  return result.rows
}

export async function getAccessibleProjectSchemaNamesForRole(client: PoolClient, roleName: string) {
  const assignments = await listRoleProjectAssignments(client, roleName)
  return new Set(assignments.map((assignment) => assignment.schema_name))
}

export async function canRoleAccessProjectSchema(
  client: PoolClient,
  roleName: string,
  schemaName: string
) {
  await ensureProjectRoleAssignmentsTable(client)

  const result = await client.query<{ allowed: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM ${getQuotedProjectsTableRef()} projects
        LEFT JOIN ${getQuotedProjectRoleAssignmentsTableRef()} assignments
          ON assignments.project_id = projects.id
        WHERE projects.schema_name = $1
          AND (
            lower(projects.creator_role_name) = lower($2)
            OR lower(assignments.role_name) = lower($2)
          )
      ) AS allowed
    `,
    [schemaName, roleName]
  )

  return Boolean(result.rows[0]?.allowed)
}

export async function canAdminRoleAccessSchema(
  client: PoolClient,
  roleName: string,
  schemaName: string
) {
  const project = await getProjectRecordBySchemaName(client, schemaName)
  if (!project) {
    return true
  }

  return canRoleAccessProjectSchema(client, roleName, schemaName)
}

export async function removeProjectRecord(client: PoolClient, schemaName: string) {
  await ensureProjectsTable(client)
  const result = await client.query<ProjectRecord>(
    `
      DELETE FROM ${getQuotedProjectsTableRef()}
      WHERE schema_name = $1
      RETURNING ${PROJECT_RECORD_COLUMNS}
    `,
    [schemaName]
  )
  return result.rows[0] ?? null
}
