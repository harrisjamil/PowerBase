import type { PoolClient } from "pg"
import { getEffectiveParsed } from "@/lib/effective-database-url"
import { readVmLocalSettings } from "@/lib/vm-local-settings"
import {
  getControlSchema,
  getQuotedAgentsTableRef,
  getQuotedDbUsersTableRef,
  getQuotedProjectsTableRef,
} from "@/lib/control-schema"
import { ensureAgentsTable } from "@/lib/agents"
import { countDataLibraryAssets } from "@/lib/data-library"
import { ensureDbUsersTable, listManagedDbUsers } from "@/lib/db-users"
import { ensureProjectsTable } from "@/lib/projects"
import { listTeams } from "@/lib/teams"
import type { PrincipalSession } from "@/lib/auth/principal-session"

export type AdminDashboardStats = {
  projects: number
  activeProjects: number
  schemas: number
  teams: number
  dbUsers: number
  agents: number
  libraryAssets: number
  totalTables: number
  dbSizeBytes: number
  dbSizePretty: string
  activeConnections: number
}

export type AdminDashboardVm = {
  displayName: string
  host: string
  port: string
  database: string
  pgVersion: string
  controlSchema: string
}

export type AdminDashboardProject = {
  id: number
  name: string
  schemaName: string
  status: string
  tableCount: number
  totalSize: string
  owner: string
  updatedAt: string | null
}

export type AdminDashboardTeam = {
  id: number
  name: string
  memberCount: number
  privacy: string
  updatedAt: string
}

export type AdminDashboardSchema = {
  schemaName: string
  projectName: string | null
  tableCount: number
  totalSize: string
  owner: string
}

export type AdminDashboardTableStat = {
  schemaName: string
  tableName: string
  liveRows: number
  deadRows: number
  lastAnalyze: string | null
}

export type AdminDashboardPayload = {
  stats: AdminDashboardStats
  vm: AdminDashboardVm
  recentProjects: AdminDashboardProject[]
  recentTeams: AdminDashboardTeam[]
  topSchemas: AdminDashboardSchema[]
  topTables: AdminDashboardTableStat[]
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, index)
  return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`
}

function shortenPgVersion(version: string): string {
  const match = version.match(/PostgreSQL\s+[\d.]+/)
  return match ? match[0] : version.split(",")[0]?.trim() || version
}

export async function buildAdminDashboard(
  client: PoolClient,
  session: PrincipalSession
): Promise<AdminDashboardPayload> {
  await ensureProjectsTable(client)
  await ensureDbUsersTable(client)
  await ensureAgentsTable(client)

  const parsed = getEffectiveParsed()
  const local = readVmLocalSettings()
  const controlSchema = getControlSchema()

  const projectRows = await client.query<{
    id: number
    name: string
    schema_name: string
    status: string
    table_count: number
    total_size: string
    owner: string
    updated_at: string | null
  }>(
    `
      SELECT
        projects.id,
        projects.name,
        projects.schema_name,
        projects.status,
        COUNT(DISTINCT c.oid) FILTER (
          WHERE c.relkind IN ('r', 'v', 'm', 'p') AND c.relname NOT LIKE 'pg_%'
        )::int AS table_count,
        COALESCE(pg_catalog.pg_size_pretty(SUM(pg_catalog.pg_total_relation_size(c.oid))), '0 bytes') AS total_size,
        COALESCE(pg_catalog.pg_get_userbyid(n.nspowner), 'unknown') AS owner,
        projects.updated_at::text AS updated_at
      FROM ${getQuotedProjectsTableRef()} projects
      LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = projects.schema_name
      LEFT JOIN pg_catalog.pg_class c
        ON c.relnamespace = n.oid
        AND c.relkind IN ('r', 'v', 'm', 'p')
        AND c.relname NOT LIKE 'pg_%'
      GROUP BY projects.id, projects.name, projects.schema_name, projects.status, n.nspowner, projects.updated_at
      ORDER BY projects.updated_at DESC NULLS LAST, projects.id DESC
      LIMIT 8
    `
  )

  const schemaRows = await client.query<{
    schema_name: string
    project_name: string | null
    table_count: number
    total_size: string
    owner: string
    total_size_bytes: string | number
  }>(
    `
      SELECT
        n.nspname AS schema_name,
        projects.name AS project_name,
        COUNT(DISTINCT c.oid) FILTER (
          WHERE c.relkind IN ('r', 'v', 'm', 'p') AND c.relname NOT LIKE 'pg_%'
        )::int AS table_count,
        COALESCE(pg_catalog.pg_size_pretty(SUM(pg_catalog.pg_total_relation_size(c.oid))), '0 bytes') AS total_size,
        COALESCE(SUM(pg_catalog.pg_total_relation_size(c.oid)), 0)::bigint AS total_size_bytes,
        COALESCE(pg_catalog.pg_get_userbyid(n.nspowner), 'unknown') AS owner
      FROM pg_catalog.pg_namespace n
      LEFT JOIN pg_catalog.pg_class c
        ON c.relnamespace = n.oid
        AND c.relkind IN ('r', 'v', 'm', 'p')
        AND c.relname NOT LIKE 'pg_%'
      LEFT JOIN ${getQuotedProjectsTableRef()} projects
        ON projects.schema_name = n.nspname
      WHERE n.nspname NOT LIKE 'pg_%'
        AND n.nspname <> 'information_schema'
        AND n.nspname NOT LIKE '%backup%'
      GROUP BY n.nspname, n.nspowner, projects.name
      ORDER BY COALESCE(SUM(pg_catalog.pg_total_relation_size(c.oid)), 0) DESC
      LIMIT 6
    `
  )

  const teams = await listTeams(client)
  const dbUsers = await listManagedDbUsers(client)
  const agentsResult = await client.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM ${getQuotedAgentsTableRef()}`
  )
  const libraryAssetCount = await countDataLibraryAssets(client, session)

  const versionResult = await client.query<{ version: string }>("SELECT version()")
  const sizeResult = await client.query<{ size: string | number }>(
    "SELECT pg_database_size($1) AS size",
    [parsed.database]
  )
  const connResult = await client.query<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE datname = $1",
    [parsed.database]
  )
  const tablesCountResult = await client.query<{ count: number }>(
    `
      SELECT COUNT(*)::int AS count
      FROM information_schema.tables
      WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
        AND table_type = 'BASE TABLE'
    `
  )
  const projectCounts = await client.query<{ total: number; active: number }>(
    `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active
      FROM ${getQuotedProjectsTableRef()}
    `
  )

  const tableStats = await client.query<{
    schemaname: string
    tablename: string
    live_rows: number
    dead_rows: number
    last_analyze: string | null
  }>(
    `
      SELECT
        schemaname,
        relname AS tablename,
        n_live_tup::int AS live_rows,
        n_dead_tup::int AS dead_rows,
        last_analyze::text AS last_analyze
      FROM pg_stat_user_tables
      ORDER BY n_live_tup DESC
      LIMIT 8
    `
  )
  const dbSizeBytes = Number(sizeResult.rows[0]?.size ?? 0)
  const pgVersion = shortenPgVersion(versionResult.rows[0]?.version ?? "Unknown")

  const stats: AdminDashboardStats = {
    projects: projectCounts.rows[0]?.total ?? projectRows.rows.length,
    activeProjects: projectCounts.rows[0]?.active ?? 0,
    schemas: schemaRows.rows.length,
    teams: teams.length,
    dbUsers: dbUsers.length,
    agents: agentsResult.rows[0]?.count ?? 0,
    libraryAssets: libraryAssetCount,
    totalTables: tablesCountResult.rows[0]?.count ?? 0,
    dbSizeBytes,
    dbSizePretty: formatBytes(dbSizeBytes),
    activeConnections: Number(connResult.rows[0]?.count ?? 0),
  }

  return {
    stats,
    vm: {
      displayName: local.displayName?.trim() || "PowerBuddy VM",
      host: parsed.host,
      port: parsed.port,
      database: parsed.database,
      pgVersion,
      controlSchema,
    },
    recentProjects: projectRows.rows.map((row) => ({
      id: row.id,
      name: row.name,
      schemaName: row.schema_name,
      status: row.status,
      tableCount: row.table_count,
      totalSize: row.total_size,
      owner: row.owner,
      updatedAt: row.updated_at,
    })),
    recentTeams: teams.slice(0, 6).map((team) => ({
      id: team.id,
      name: team.name,
      memberCount: team.member_count,
      privacy: team.privacy,
      updatedAt: team.updated_at,
    })),
    topSchemas: schemaRows.rows.map((row) => ({
      schemaName: row.schema_name,
      projectName: row.project_name,
      tableCount: row.table_count,
      totalSize: row.total_size,
      owner: row.owner,
    })),
    topTables: tableStats.rows.map((row) => ({
      schemaName: row.schemaname,
      tableName: row.tablename,
      liveRows: row.live_rows,
      deadRows: row.dead_rows,
      lastAnalyze: row.last_analyze,
    })),
  }
}
