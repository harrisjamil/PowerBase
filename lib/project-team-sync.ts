import type { PoolClient } from "pg"
import {
  getQuotedTeamMembersTableRef,
  getQuotedTeamProjectAssignmentsTableRef,
  getQuotedTeamsTableRef,
  isSafePgIdentifier,
} from "@/lib/control-schema"
import {
  ensureProjectRoleAssignmentsTable,
  getProjectRecordById,
  getQuotedProjectRoleAssignmentsTableRef,
  listProjectRoleAssignments,
} from "@/lib/projects"
import {
  ensurePgUserSchemaPrivilegesMatchAccess,
  ensureTeamMembersTable,
  listTeamProjects,
  syncTeamMemberSchemaAccessForMember,
} from "@/lib/teams"
import { grantSchemaPrivilegesToRole } from "@/lib/postgres-roles"

export type ProjectTeamRef = {
  id: number
  name: string
}

export async function listTeamsForProject(
  client: PoolClient,
  projectId: number
): Promise<ProjectTeamRef[]> {
  await ensureProjectRoleAssignmentsTable(client)

  const result = await client.query<ProjectTeamRef>(
    `
      SELECT teams.id, teams.name
      FROM ${getQuotedTeamProjectAssignmentsTableRef()} assignments
      INNER JOIN ${getQuotedTeamsTableRef()} teams
        ON teams.id = assignments.team_id
      WHERE assignments.project_id = $1
      ORDER BY lower(teams.name), teams.id
    `,
    [projectId]
  )

  return result.rows
}

export async function ensureProjectRoleAssignment(
  client: PoolClient,
  projectId: number,
  roleName: string
): Promise<boolean> {
  const trimmed = roleName.trim()
  if (!trimmed || !isSafePgIdentifier(trimmed)) {
    return false
  }

  await ensureProjectRoleAssignmentsTable(client)

  const result = await client.query(
    `
      INSERT INTO ${getQuotedProjectRoleAssignmentsTableRef()} (
        project_id,
        role_name,
        created_at,
        updated_at
      )
      VALUES ($1, $2, now(), now())
      ON CONFLICT (project_id, role_name) DO NOTHING
      RETURNING role_name
    `,
    [projectId, trimmed]
  )

  return (result.rowCount ?? 0) > 0
}

export async function removeProjectRoleAssignment(
  client: PoolClient,
  projectId: number,
  roleName: string,
  creatorRoleName?: string | null
): Promise<boolean> {
  const trimmed = roleName.trim()
  if (!trimmed) {
    return false
  }

  const creator = creatorRoleName?.trim()
  if (creator && creator.toLowerCase() === trimmed.toLowerCase()) {
    return false
  }

  await ensureProjectRoleAssignmentsTable(client)

  const result = await client.query(
    `
      DELETE FROM ${getQuotedProjectRoleAssignmentsTableRef()}
      WHERE project_id = $1
        AND lower(role_name) = lower($2)
    `,
    [projectId, trimmed]
  )

  return (result.rowCount ?? 0) > 0
}

async function getTeamMemberId(
  client: PoolClient,
  teamId: number,
  pgUsername: string
): Promise<number | null> {
  const result = await client.query<{ id: number }>(
    `
      SELECT id
      FROM ${getQuotedTeamMembersTableRef()}
      WHERE team_id = $1
        AND lower(pg_username) = lower($2)
      LIMIT 1
    `,
    [teamId, pgUsername]
  )

  return result.rows[0]?.id ?? null
}

export async function ensureTeamMemberForProjectSync(
  client: PoolClient,
  teamId: number,
  pgUsername: string
) {
  await ensureTeamMembersTable(client)

  const trimmed = pgUsername.trim()
  if (!trimmed || !isSafePgIdentifier(trimmed)) {
    return
  }

  const existingId = await getTeamMemberId(client, teamId, trimmed)
  if (existingId) {
    const result = await client.query(
      `
        UPDATE ${getQuotedTeamMembersTableRef()}
        SET status = 'active'
        WHERE id = $1
          AND status <> 'active'
      `,
      [existingId]
    )
    if ((result.rowCount ?? 0) > 0) {
      await syncTeamMemberSchemaAccessForMember(client, teamId, trimmed, true)
    }
    return
  }

  await client.query(
    `
      INSERT INTO ${getQuotedTeamMembersTableRef()} (team_id, pg_username, role, status)
      VALUES ($1, $2, 'member', 'active')
    `,
    [teamId, trimmed]
  )

  await client.query(
    `UPDATE ${getQuotedTeamsTableRef()} SET updated_at = now() WHERE id = $1`,
    [teamId]
  )

  await syncTeamMemberSchemaAccessForMember(client, teamId, trimmed, true)
}

export async function removeTeamMemberForProjectSync(
  client: PoolClient,
  teamId: number,
  pgUsername: string
) {
  await ensureTeamMembersTable(client)

  const memberId = await getTeamMemberId(client, teamId, pgUsername)
  if (!memberId) {
    return
  }

  const existing = await client.query<{ status: string }>(
    `
      SELECT status
      FROM ${getQuotedTeamMembersTableRef()}
      WHERE id = $1 AND team_id = $2
      LIMIT 1
    `,
    [memberId, teamId]
  )

  const wasActive = existing.rows[0]?.status === "active"

  await client.query(
    `
      DELETE FROM ${getQuotedTeamMembersTableRef()}
      WHERE id = $1 AND team_id = $2
    `,
    [memberId, teamId]
  )

  if (wasActive) {
    await syncTeamMemberSchemaAccessForMember(client, teamId, pgUsername, false)
    await syncPgUserToTeamProjects(client, teamId, pgUsername, false)
  }

  await client.query(
    `UPDATE ${getQuotedTeamsTableRef()} SET updated_at = now() WHERE id = $1`,
    [teamId]
  )
}

/** Mirror team membership onto project_role_assignments for all projects assigned to the team. */
export async function syncPgUserToTeamProjects(
  client: PoolClient,
  teamId: number,
  pgUsername: string,
  grant: boolean
) {
  const projects = await listTeamProjects(client, teamId)

  if (grant) {
    for (const project of projects) {
      const inserted = await ensureProjectRoleAssignment(client, project.project_id, pgUsername)
      if (inserted) {
        await grantSchemaPrivilegesToRole(client, pgUsername, project.schema_name)
      }
    }
    return
  }

  for (const project of projects) {
    const projectRecord = await getProjectRecordById(client, project.project_id)
    await removeProjectRoleAssignment(
      client,
      project.project_id,
      pgUsername,
      projectRecord?.creator_role_name ?? null
    )
    await ensurePgUserSchemaPrivilegesMatchAccess(client, pgUsername, [project.schema_name])
  }
}

/** Mirror project assignment onto every team that has this project assigned. */
export async function syncPgUserToProjectTeams(
  client: PoolClient,
  projectId: number,
  pgUsername: string,
  grant: boolean
) {
  const teams = await listTeamsForProject(client, projectId)

  for (const team of teams) {
    if (grant) {
      await ensureTeamMemberForProjectSync(client, team.id, pgUsername)
      await syncPgUserToTeamProjects(client, team.id, pgUsername, true)
    } else {
      await removeTeamMemberForProjectSync(client, team.id, pgUsername)
    }
  }
}

/** When a project is assigned to a team, add all active members to the project user list. */
export async function syncTeamProjectToAllMembers(
  client: PoolClient,
  teamId: number,
  projectId: number,
  grant: boolean
) {
  const project = await getProjectRecordById(client, projectId)
  if (!project) {
    return
  }

  const members = await client.query<{ pg_username: string }>(
    `
      SELECT pg_username
      FROM ${getQuotedTeamMembersTableRef()}
      WHERE team_id = $1
        AND status = 'active'
      ORDER BY lower(pg_username)
    `,
    [teamId]
  )

  for (const member of members.rows) {
    if (grant) {
      const inserted = await ensureProjectRoleAssignment(client, projectId, member.pg_username)
      if (inserted) {
        await grantSchemaPrivilegesToRole(client, member.pg_username, project.schema_name)
      }
    } else {
      await removeProjectRoleAssignment(
        client,
        projectId,
        member.pg_username,
        project.creator_role_name
      )
      await ensurePgUserSchemaPrivilegesMatchAccess(client, member.pg_username, [project.schema_name])
    }
  }
}

export async function listEffectiveProjectAssignees(
  client: PoolClient,
  projectId: number,
  creatorRoleName?: string | null
): Promise<string[]> {
  const direct = await listProjectRoleAssignments(client, projectId)
  const teams = await listTeamsForProject(client, projectId)

  const usernames = new Set(direct.map((name) => name.trim()).filter(Boolean))

  if (teams.length > 0) {
    const result = await client.query<{ pg_username: string }>(
      `
        SELECT DISTINCT members.pg_username
        FROM ${getQuotedTeamMembersTableRef()} members
        INNER JOIN ${getQuotedTeamProjectAssignmentsTableRef()} assignments
          ON assignments.team_id = members.team_id
        WHERE assignments.project_id = $1
          AND members.status = 'active'
        ORDER BY lower(members.pg_username)
      `,
      [projectId]
    )

    for (const row of result.rows) {
      const name = row.pg_username.trim()
      if (name) {
        usernames.add(name)
      }
    }
  }

  const creator = creatorRoleName?.trim()
  if (creator && isSafePgIdentifier(creator)) {
    usernames.add(creator)
  }

  return Array.from(usernames).sort((left, right) => left.localeCompare(right))
}
