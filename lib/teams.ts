import type { PoolClient } from "pg"
import {
  ensureControlSchema,
  getControlSchema,
  getQuotedProjectsTableRef,
  getQuotedTeamMembersTableRef,
  getQuotedTeamProjectAssignmentsTableRef,
  getQuotedTeamsTableRef,
  isSafePgIdentifier,
  quotePgIdentifier,
} from "@/lib/control-schema"
import { ensureDbBootstrap } from "@/lib/db-bootstrap-cache"
import { ensureProjectsTable } from "@/lib/projects"

export type TeamPrivacy = "public" | "private"
export type TeamMemberRole = "admin" | "member" | "viewer"
export type TeamMemberStatus = "active" | "invited" | "disabled"

export type TeamRecord = {
  id: number
  name: string
  description: string | null
  privacy: TeamPrivacy
  created_at: string
  updated_at: string
  member_count: number
  owner: string | null
}

export type TeamMemberRecord = {
  id: number
  team_id: number
  pg_username: string
  role: TeamMemberRole
  status: TeamMemberStatus
  joined_at: string
  can_login: boolean
}

function getTeamsBootstrapKey(client: PoolClient, suffix: string) {
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

export async function ensureTeamsTable(client: PoolClient) {
  await ensureDbBootstrap(getTeamsBootstrapKey(client, "teams"), async () => {
    await ensureControlSchema(client)

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${getQuotedTeamsTableRef()} (
        id serial PRIMARY KEY,
        name text NOT NULL,
        description text NULL,
        privacy text NOT NULL DEFAULT 'private',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT teams_privacy_check CHECK (privacy IN ('public', 'private'))
      )
    `)
  })
}

export async function ensureTeamMembersTable(client: PoolClient) {
  await ensureTeamsTable(client)

  await ensureDbBootstrap(getTeamsBootstrapKey(client, "team-members"), async () => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${getQuotedTeamMembersTableRef()} (
        id serial PRIMARY KEY,
        team_id integer NOT NULL REFERENCES ${getQuotedTeamsTableRef()} (id) ON DELETE CASCADE,
        pg_username text NOT NULL,
        role text NOT NULL DEFAULT 'member',
        status text NOT NULL DEFAULT 'active',
        joined_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT team_members_role_check CHECK (role IN ('admin', 'member', 'viewer')),
        CONSTRAINT team_members_status_check CHECK (status IN ('active', 'invited', 'disabled')),
        CONSTRAINT team_members_team_username_unique UNIQUE (team_id, pg_username)
      )
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS ${quotePgIdentifier("team_members_team_id_idx")}
      ON ${getQuotedTeamMembersTableRef()} (team_id)
    `)
  })
}

export function readTeamPrivacy(value: unknown): TeamPrivacy | null {
  if (value === "public" || value === "private") return value
  return null
}

export function readTeamMemberRole(value: unknown): TeamMemberRole | null {
  if (value === "admin" || value === "member" || value === "viewer") return value
  return null
}

export function readTeamMemberStatus(value: unknown): TeamMemberStatus | null {
  if (value === "active" || value === "invited" || value === "disabled") return value
  return null
}

export function readPgUsernames(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const usernames: string[] = []
  for (const item of value) {
    if (typeof item !== "string") return null
    const username = item.trim()
    if (!username || !isSafePgIdentifier(username)) return null
    if (!usernames.includes(username)) {
      usernames.push(username)
    }
  }
  return usernames
}

async function pgRoleExists(client: PoolClient, username: string) {
  const result = await client.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles
        WHERE rolname = $1
      ) AS exists
    `,
    [username]
  )
  return Boolean(result.rows[0]?.exists)
}

export async function listTeams(client: PoolClient): Promise<TeamRecord[]> {
  await ensureTeamMembersTable(client)

  const result = await client.query<TeamRecord>(
    `
      SELECT
        teams.id,
        teams.name,
        teams.description,
        teams.privacy,
        teams.created_at::text,
        teams.updated_at::text,
        COUNT(members.id)::int AS member_count,
        (
          SELECT tm.pg_username
          FROM ${getQuotedTeamMembersTableRef()} tm
          WHERE tm.team_id = teams.id
          ORDER BY
            CASE tm.role WHEN 'admin' THEN 0 ELSE 1 END,
            tm.joined_at ASC
          LIMIT 1
        ) AS owner
      FROM ${getQuotedTeamsTableRef()} teams
      LEFT JOIN ${getQuotedTeamMembersTableRef()} members
        ON members.team_id = teams.id
      GROUP BY teams.id
      ORDER BY lower(teams.name), teams.id
    `
  )

  return result.rows
}

export async function getTeamById(client: PoolClient, id: number): Promise<TeamRecord | null> {
  await ensureTeamMembersTable(client)

  const result = await client.query<TeamRecord>(
    `
      SELECT
        teams.id,
        teams.name,
        teams.description,
        teams.privacy,
        teams.created_at::text,
        teams.updated_at::text,
        COUNT(members.id)::int AS member_count,
        (
          SELECT tm.pg_username
          FROM ${getQuotedTeamMembersTableRef()} tm
          WHERE tm.team_id = teams.id
          ORDER BY
            CASE tm.role WHEN 'admin' THEN 0 ELSE 1 END,
            tm.joined_at ASC
          LIMIT 1
        ) AS owner
      FROM ${getQuotedTeamsTableRef()} teams
      LEFT JOIN ${getQuotedTeamMembersTableRef()} members
        ON members.team_id = teams.id
      WHERE teams.id = $1
      GROUP BY teams.id
      LIMIT 1
    `,
    [id]
  )

  return result.rows[0] ?? null
}

export async function listTeamMembers(
  client: PoolClient,
  teamId: number
): Promise<TeamMemberRecord[]> {
  await ensureTeamMembersTable(client)

  const result = await client.query<TeamMemberRecord>(
    `
      SELECT
        members.id,
        members.team_id,
        members.pg_username,
        members.role,
        members.status,
        members.joined_at::text,
        COALESCE(pg_roles.rolcanlogin, false) AS can_login
      FROM ${getQuotedTeamMembersTableRef()} members
      LEFT JOIN pg_catalog.pg_roles
        ON pg_roles.rolname = members.pg_username
      WHERE members.team_id = $1
      ORDER BY
        CASE members.role WHEN 'admin' THEN 0 WHEN 'member' THEN 1 ELSE 2 END,
        lower(members.pg_username)
    `,
    [teamId]
  )

  return result.rows
}

export type CreateTeamInput = {
  name: string
  description?: string | null
  privacy?: TeamPrivacy
  memberUsernames?: string[]
}

export async function createTeam(client: PoolClient, input: CreateTeamInput) {
  await ensureTeamMembersTable(client)

  const name = input.name.trim()
  if (!name) {
    throw new Error("Team name is required")
  }

  const privacy = input.privacy ?? "private"
  const memberUsernames = input.memberUsernames ?? []

  for (const username of memberUsernames) {
    if (!(await pgRoleExists(client, username))) {
      throw new Error(`PostgreSQL user "${username}" does not exist`)
    }
  }

  const teamResult = await client.query<{ id: number }>(
    `
      INSERT INTO ${getQuotedTeamsTableRef()} (name, description, privacy)
      VALUES ($1, $2, $3)
      RETURNING id
    `,
    [name, input.description?.trim() || null, privacy]
  )

  const teamId = teamResult.rows[0]?.id
  if (!teamId) {
    throw new Error("Failed to create team")
  }

  for (let index = 0; index < memberUsernames.length; index++) {
    const username = memberUsernames[index]
    await client.query(
      `
        INSERT INTO ${getQuotedTeamMembersTableRef()} (team_id, pg_username, role, status)
        VALUES ($1, $2, $3, 'active')
      `,
      [teamId, username, index === 0 ? "admin" : "member"]
    )
  }

  const team = await getTeamById(client, teamId)
  if (!team) {
    throw new Error("Failed to load created team")
  }

  return team
}

export async function deleteTeam(client: PoolClient, id: number) {
  await ensureTeamMembersTable(client)
  await ensureTeamProjectAssignmentsTable(client)

  const members = await client.query<{ pg_username: string }>(
    `
      SELECT pg_username
      FROM ${getQuotedTeamMembersTableRef()}
      WHERE team_id = $1
    `,
    [id]
  )
  const projects = await listTeamProjects(client, id)
  const schemaNames = projects.map((project) => project.schema_name)

  const result = await client.query(
    `DELETE FROM ${getQuotedTeamsTableRef()} WHERE id = $1`,
    [id]
  )

  if ((result.rowCount ?? 0) > 0) {
    for (const member of members.rows) {
      await ensurePgUserSchemaPrivilegesMatchAccess(client, member.pg_username, schemaNames)
    }
  }

  return (result.rowCount ?? 0) > 0
}

export type AddTeamMemberInput = {
  pgUsername: string
  role?: TeamMemberRole
  status?: TeamMemberStatus
}

export async function addTeamMember(
  client: PoolClient,
  teamId: number,
  input: AddTeamMemberInput
) {
  await ensureTeamMembersTable(client)

  const team = await getTeamById(client, teamId)
  if (!team) {
    throw new Error("Team not found")
  }

  const pgUsername = input.pgUsername.trim()
  if (!pgUsername || !isSafePgIdentifier(pgUsername)) {
    throw new Error("Invalid PostgreSQL username")
  }

  if (!(await pgRoleExists(client, pgUsername))) {
    throw new Error(`PostgreSQL user "${pgUsername}" does not exist`)
  }

  const role = input.role ?? "member"
  const status = input.status ?? "active"

  const result = await client.query<TeamMemberRecord>(
    `
      INSERT INTO ${getQuotedTeamMembersTableRef()} (team_id, pg_username, role, status)
      VALUES ($1, $2, $3, $4)
      RETURNING
        id,
        team_id,
        pg_username,
        role,
        status,
        joined_at::text,
        true AS can_login
    `,
    [teamId, pgUsername, role, status]
  )

  await client.query(
    `UPDATE ${getQuotedTeamsTableRef()} SET updated_at = now() WHERE id = $1`,
    [teamId]
  )

  const member = result.rows[0]
  if (!member) {
    throw new Error("Failed to add team member")
  }

  if (status === "active") {
    await syncTeamMemberSchemaAccessForMember(client, teamId, pgUsername, true)
    const { syncPgUserToTeamProjects } = await import("@/lib/project-team-sync")
    await syncPgUserToTeamProjects(client, teamId, pgUsername, true)
  }

  return member
}

export async function getTeamMemberById(
  client: PoolClient,
  teamId: number,
  memberId: number
): Promise<TeamMemberRecord | null> {
  await ensureTeamMembersTable(client)

  const result = await client.query<TeamMemberRecord>(
    `
      SELECT
        members.id,
        members.team_id,
        members.pg_username,
        members.role,
        members.status,
        members.joined_at::text,
        COALESCE(pg_roles.rolcanlogin, false) AS can_login
      FROM ${getQuotedTeamMembersTableRef()} members
      LEFT JOIN pg_catalog.pg_roles
        ON pg_roles.rolname = members.pg_username
      WHERE members.id = $1 AND members.team_id = $2
      LIMIT 1
    `,
    [memberId, teamId]
  )

  return result.rows[0] ?? null
}

export type UpdateTeamMemberInput = {
  role?: TeamMemberRole
  status?: TeamMemberStatus
}

export async function updateTeamMember(
  client: PoolClient,
  teamId: number,
  memberId: number,
  input: UpdateTeamMemberInput
) {
  await ensureTeamMembersTable(client)

  const existing = await getTeamMemberById(client, teamId, memberId)
  if (!existing) {
    throw new Error("Team member not found")
  }

  const role = input.role ?? existing.role
  const status = input.status ?? existing.status

  const result = await client.query<TeamMemberRecord>(
    `
      UPDATE ${getQuotedTeamMembersTableRef()}
      SET role = $1, status = $2
      WHERE id = $3 AND team_id = $4
      RETURNING
        id,
        team_id,
        pg_username,
        role,
        status,
        joined_at::text,
        true AS can_login
    `,
    [role, status, memberId, teamId]
  )

  await client.query(
    `UPDATE ${getQuotedTeamsTableRef()} SET updated_at = now() WHERE id = $1`,
    [teamId]
  )

  const member = result.rows[0]
  if (!member) {
    throw new Error("Failed to update team member")
  }

  const wasActive = existing.status === "active"
  const isActive = status === "active"

  const { syncPgUserToTeamProjects } = await import("@/lib/project-team-sync")

  if (!wasActive && isActive) {
    await syncTeamMemberSchemaAccessForMember(client, teamId, existing.pg_username, true)
    await syncPgUserToTeamProjects(client, teamId, existing.pg_username, true)
  } else if (wasActive && !isActive) {
    await syncTeamMemberSchemaAccessForMember(client, teamId, existing.pg_username, false)
    await syncPgUserToTeamProjects(client, teamId, existing.pg_username, false)
    const projects = await listTeamProjects(client, teamId)
    await ensurePgUserSchemaPrivilegesMatchAccess(
      client,
      existing.pg_username,
      projects.map((project) => project.schema_name)
    )
  } else if (wasActive && isActive) {
    await syncTeamMemberSchemaAccessForMember(client, teamId, existing.pg_username, true)
  }

  return member
}

export type TeamProjectRecord = {
  id: number
  team_id: number
  project_id: number
  project_ref: string
  project_name: string
  schema_name: string
  description: string | null
  status: string
  assigned_at: string
}

export async function ensureTeamProjectAssignmentsTable(client: PoolClient) {
  await ensureTeamMembersTable(client)
  await ensureProjectsTable(client)

  await ensureDbBootstrap(getTeamsBootstrapKey(client, "team-projects"), async () => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${getQuotedTeamProjectAssignmentsTableRef()} (
        id serial PRIMARY KEY,
        team_id integer NOT NULL REFERENCES ${getQuotedTeamsTableRef()} (id) ON DELETE CASCADE,
        project_id integer NOT NULL REFERENCES ${getQuotedProjectsTableRef()} (id) ON DELETE CASCADE,
        assigned_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT team_project_assignments_unique UNIQUE (team_id, project_id)
      )
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS ${quotePgIdentifier("team_project_assignments_team_id_idx")}
      ON ${getQuotedTeamProjectAssignmentsTableRef()} (team_id)
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS ${quotePgIdentifier("team_project_assignments_project_id_idx")}
      ON ${getQuotedTeamProjectAssignmentsTableRef()} (project_id)
    `)
  })
}

export function readProjectIds(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null
  const ids: number[] = []
  for (const item of value) {
    if (typeof item === "number" && Number.isInteger(item) && item > 0) {
      if (!ids.includes(item)) ids.push(item)
      continue
    }
    if (typeof item === "string" && /^\d+$/.test(item)) {
      const id = Number(item)
      if (!ids.includes(id)) ids.push(id)
      continue
    }
    return null
  }
  return ids
}

export async function listTeamProjects(
  client: PoolClient,
  teamId: number
): Promise<TeamProjectRecord[]> {
  await ensureTeamProjectAssignmentsTable(client)

  const result = await client.query<TeamProjectRecord>(
    `
      SELECT
        assignments.id,
        assignments.team_id,
        projects.id AS project_id,
        COALESCE(projects.project_ref, '') AS project_ref,
        projects.name AS project_name,
        projects.schema_name,
        projects.description,
        projects.status,
        assignments.assigned_at::text
      FROM ${getQuotedTeamProjectAssignmentsTableRef()} assignments
      INNER JOIN ${getQuotedProjectsTableRef()} projects
        ON projects.id = assignments.project_id
      WHERE assignments.team_id = $1
      ORDER BY lower(projects.name), projects.id
    `,
    [teamId]
  )

  return result.rows
}

export async function assignTeamProjects(
  client: PoolClient,
  teamId: number,
  projectIds: number[]
) {
  await ensureTeamProjectAssignmentsTable(client)

  const team = await getTeamById(client, teamId)
  if (!team) {
    throw new Error("Team not found")
  }

  if (projectIds.length === 0) {
    throw new Error("Select at least one project")
  }

  for (const projectId of projectIds) {
    const projectResult = await client.query<{ schema_name: string }>(
      `SELECT schema_name FROM ${getQuotedProjectsTableRef()} WHERE id = $1 LIMIT 1`,
      [projectId]
    )
    const schemaName = projectResult.rows[0]?.schema_name
    if (!schemaName) {
      throw new Error(`Project with id ${projectId} not found`)
    }

    const insertResult = await client.query(
      `
        INSERT INTO ${getQuotedTeamProjectAssignmentsTableRef()} (team_id, project_id)
        VALUES ($1, $2)
        ON CONFLICT (team_id, project_id) DO NOTHING
        RETURNING id
      `,
      [teamId, projectId]
    )

    if ((insertResult.rowCount ?? 0) > 0) {
      await syncTeamMemberSchemaAccessForProject(client, teamId, schemaName, true)
      const { syncTeamProjectToAllMembers } = await import("@/lib/project-team-sync")
      await syncTeamProjectToAllMembers(client, teamId, projectId, true)
    }
  }

  await client.query(
    `UPDATE ${getQuotedTeamsTableRef()} SET updated_at = now() WHERE id = $1`,
    [teamId]
  )

  return listTeamProjects(client, teamId)
}

export async function unassignTeamProject(
  client: PoolClient,
  teamId: number,
  projectId: number
) {
  await ensureTeamProjectAssignmentsTable(client)

  const projectResult = await client.query<{ schema_name: string }>(
    `SELECT schema_name FROM ${getQuotedProjectsTableRef()} WHERE id = $1 LIMIT 1`,
    [projectId]
  )
  const schemaName = projectResult.rows[0]?.schema_name

  const result = await client.query(
    `
      DELETE FROM ${getQuotedTeamProjectAssignmentsTableRef()}
      WHERE team_id = $1 AND project_id = $2
    `,
    [teamId, projectId]
  )

  if ((result.rowCount ?? 0) > 0) {
    if (schemaName) {
      await syncTeamMemberSchemaAccessForProject(client, teamId, schemaName, false)
      const { syncTeamProjectToAllMembers } = await import("@/lib/project-team-sync")
      await syncTeamProjectToAllMembers(client, teamId, projectId, false)
      const memberUsernames = await listActiveTeamMemberUsernames(client, teamId)
      await Promise.all(
        memberUsernames.map((username) =>
          ensurePgUserSchemaPrivilegesMatchAccess(client, username, [schemaName])
        )
      )
    }
    await client.query(
      `UPDATE ${getQuotedTeamsTableRef()} SET updated_at = now() WHERE id = $1`,
      [teamId]
    )
  }

  return (result.rowCount ?? 0) > 0
}

export async function getTeamAdminProjectSchemaNamesForPgUser(
  client: PoolClient,
  pgUsername: string
): Promise<Set<string>> {
  const bySchema = await getTeamAccessBySchemaForPgUser(client, pgUsername)
  return new Set(bySchema.keys())
}

export async function getTeamAccessBySchemaForPgUser(
  client: PoolClient,
  pgUsername: string
): Promise<Map<string, string[]>> {
  await ensureTeamProjectAssignmentsTable(client)

  const result = await client.query<{ schema_name: string; team_name: string }>(
    `
      SELECT DISTINCT projects.schema_name, teams.name AS team_name
      FROM ${getQuotedTeamMembersTableRef()} members
      INNER JOIN ${getQuotedTeamProjectAssignmentsTableRef()} assignments
        ON assignments.team_id = members.team_id
      INNER JOIN ${getQuotedProjectsTableRef()} projects
        ON projects.id = assignments.project_id
      INNER JOIN ${getQuotedTeamsTableRef()} teams
        ON teams.id = members.team_id
      WHERE lower(members.pg_username) = lower($1)
        AND members.status = 'active'
      ORDER BY projects.schema_name, teams.name
    `,
    [pgUsername]
  )

  const bySchema = new Map<string, string[]>()
  for (const row of result.rows) {
    const existing = bySchema.get(row.schema_name) ?? []
    if (!existing.includes(row.team_name)) {
      existing.push(row.team_name)
      bySchema.set(row.schema_name, existing)
    }
  }
  return bySchema
}

export async function canPgUserAccessProjectViaTeam(
  client: PoolClient,
  pgUsername: string,
  schemaName: string
): Promise<boolean> {
  await ensureTeamProjectAssignmentsTable(client)

  const result = await client.query<{ allowed: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM ${getQuotedTeamMembersTableRef()} members
        INNER JOIN ${getQuotedTeamProjectAssignmentsTableRef()} assignments
          ON assignments.team_id = members.team_id
        INNER JOIN ${getQuotedProjectsTableRef()} projects
          ON projects.id = assignments.project_id
        WHERE lower(members.pg_username) = lower($1)
          AND members.status = 'active'
          AND projects.schema_name = $2
      ) AS allowed
    `,
    [pgUsername, schemaName]
  )

  return Boolean(result.rows[0]?.allowed)
}

/** @deprecated Use canPgUserAccessProjectViaTeam */
export const canPgUserAccessProjectViaTeamAdmin = canPgUserAccessProjectViaTeam

export async function getAccessibleProjectSchemaNamesForPgUser(
  client: PoolClient,
  pgUsername: string
): Promise<Set<string>> {
  const { getAccessibleProjectSchemaNamesForRole } = await import("@/lib/projects")
  const schemas = await getAccessibleProjectSchemaNamesForRole(client, pgUsername)
  const teamSchemas = await getTeamAdminProjectSchemaNamesForPgUser(client, pgUsername)
  for (const schemaName of teamSchemas) {
    schemas.add(schemaName)
  }
  return schemas
}

export async function canPgUserAccessProjectSchema(
  client: PoolClient,
  pgUsername: string,
  schemaName: string
): Promise<boolean> {
  const { canRoleAccessProjectSchema } = await import("@/lib/projects")
  if (await canRoleAccessProjectSchema(client, pgUsername, schemaName)) {
    return true
  }
  return canPgUserAccessProjectViaTeam(client, pgUsername, schemaName)
}

export async function pgUserHasAnyProjectAccess(
  client: PoolClient,
  pgUsername: string
): Promise<boolean> {
  const { listRoleProjectAssignments } = await import("@/lib/projects")
  const individual = await listRoleProjectAssignments(client, pgUsername)
  if (individual.length > 0) {
    return true
  }
  const teamAccess = await getTeamAccessBySchemaForPgUser(client, pgUsername)
  return teamAccess.size > 0
}

/** Revoke PG schema grants when the user no longer has logical project access. */
export async function ensurePgUserSchemaPrivilegesMatchAccess(
  client: PoolClient,
  pgUsername: string,
  schemaNames: Iterable<string>
) {
  const { revokeSchemaPrivilegesFromRole } = await import("@/lib/postgres-roles")

  for (const schemaName of schemaNames) {
    if (!(await canPgUserAccessProjectSchema(client, pgUsername, schemaName))) {
      await revokeSchemaPrivilegesFromRole(client, pgUsername, schemaName)
    }
  }
}

async function listActiveTeamMemberUsernames(
  client: PoolClient,
  teamId: number
): Promise<string[]> {
  await ensureTeamMembersTable(client)

  const result = await client.query<{ pg_username: string }>(
    `
      SELECT pg_username
      FROM ${getQuotedTeamMembersTableRef()}
      WHERE team_id = $1
        AND status = 'active'
      ORDER BY lower(pg_username)
    `,
    [teamId]
  )

  return result.rows.map((row) => row.pg_username)
}

export async function syncTeamMemberSchemaAccessForProject(
  client: PoolClient,
  teamId: number,
  schemaName: string,
  grant: boolean
) {
  const { grantSchemaPrivilegesToRole, revokeSchemaPrivilegesFromRole } = await import(
    "@/lib/postgres-roles"
  )

  const memberUsernames = await listActiveTeamMemberUsernames(client, teamId)
  for (const username of memberUsernames) {
    if (grant) {
      await grantSchemaPrivilegesToRole(client, username, schemaName)
    } else {
      const stillHasIndividual = await (
        await import("@/lib/projects")
      ).canRoleAccessProjectSchema(client, username, schemaName)
      const stillHasOtherTeam = await client.query<{ allowed: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1
            FROM ${getQuotedTeamMembersTableRef()} members
            INNER JOIN ${getQuotedTeamProjectAssignmentsTableRef()} assignments
              ON assignments.team_id = members.team_id
            INNER JOIN ${getQuotedProjectsTableRef()} projects
              ON projects.id = assignments.project_id
            WHERE lower(members.pg_username) = lower($1)
              AND members.status = 'active'
              AND members.team_id <> $2
              AND projects.schema_name = $3
          ) AS allowed
        `,
        [username, teamId, schemaName]
      )
      if (stillHasIndividual || stillHasOtherTeam.rows[0]?.allowed) {
        continue
      }
      await revokeSchemaPrivilegesFromRole(client, username, schemaName)
    }
  }
}

export async function syncTeamMemberSchemaAccessForMember(
  client: PoolClient,
  teamId: number,
  pgUsername: string,
  grant: boolean
) {
  await ensureTeamProjectAssignmentsTable(client)

  const projects = await listTeamProjects(client, teamId)
  const { grantSchemaPrivilegesToRole, revokeSchemaPrivilegesFromRole } = await import(
    "@/lib/postgres-roles"
  )
  const { canRoleAccessProjectSchema } = await import("@/lib/projects")

  for (const project of projects) {
    if (grant) {
      await grantSchemaPrivilegesToRole(client, pgUsername, project.schema_name)
      continue
    }

    const stillHasIndividual = await canRoleAccessProjectSchema(
      client,
      pgUsername,
      project.schema_name
    )
    const stillHasOtherTeam = await canPgUserAccessProjectViaTeam(
      client,
      pgUsername,
      project.schema_name
    )
    if (stillHasIndividual || stillHasOtherTeam) {
      continue
    }
    await revokeSchemaPrivilegesFromRole(client, pgUsername, project.schema_name)
  }
}

export async function removeTeamMember(client: PoolClient, teamId: number, memberId: number) {
  await ensureTeamMembersTable(client)

  const existing = await getTeamMemberById(client, teamId, memberId)

  const wasActive = existing?.status === "active"
  const pgUsername = existing?.pg_username

  const result = await client.query(
    `
      DELETE FROM ${getQuotedTeamMembersTableRef()}
      WHERE id = $1 AND team_id = $2
    `,
    [memberId, teamId]
  )

  if ((result.rowCount ?? 0) > 0) {
    if (pgUsername) {
      const projects = await listTeamProjects(client, teamId)
      const schemaNames = projects.map((project) => project.schema_name)
      const { syncPgUserToTeamProjects } = await import("@/lib/project-team-sync")

      if (wasActive) {
        await syncTeamMemberSchemaAccessForMember(client, teamId, pgUsername, false)
      }
      await syncPgUserToTeamProjects(client, teamId, pgUsername, false)
      await ensurePgUserSchemaPrivilegesMatchAccess(client, pgUsername, schemaNames)
    }
    await client.query(
      `UPDATE ${getQuotedTeamsTableRef()} SET updated_at = now() WHERE id = $1`,
      [teamId]
    )
  }

  return (result.rowCount ?? 0) > 0
}
