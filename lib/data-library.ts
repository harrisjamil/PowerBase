import type { PoolClient } from "pg"
import {
  DATA_LIBRARY_ASSETS_TABLE_NAME,
  DATA_LIBRARY_FOLDERS_TABLE_NAME,
  ensureControlSchema,
  getControlSchema,
  getQuotedDataLibraryAssetsTableRef,
  getQuotedDataLibraryFoldersTableRef,
  getQuotedProjectsTableRef,
  quotePgIdentifier,
} from "@/lib/control-schema"
import { ensureDbBootstrap } from "@/lib/db-bootstrap-cache"
import { ensureProjectRoleAssignmentsTable, ensureProjectsTable } from "@/lib/projects"
import { ensureTeamsTable, listTeams } from "@/lib/teams"
import type { PrincipalSession } from "@/lib/auth/principal-session"
import { getAccessibleSchemaNamesForPrincipal } from "@/lib/principal-access"

export type DataLibraryAssetType =
  | "dataset"
  | "model"
  | "dashboard"
  | "report"
  | "api"
  | "document"

export type DataLibraryAssetStatus = "active" | "archived" | "draft"

export type DataLibraryCatalogAsset = {
  id: string
  name: string
  description: string
  type: DataLibraryAssetType
  category: string
  size: number
  version: string
  createdAt: string
  updatedAt: string
  owner: string
  tags: string[]
  status: DataLibraryAssetStatus
  downloads: number
  views: number
  url?: string
  format?: string
  derived: boolean
}

export type DataLibraryCatalogFolder = {
  id: string
  name: string
  path: string
  assetCount: number
  createdAt: string
}

export type StoredAssetRecord = {
  id: number
  name: string
  description: string | null
  asset_type: DataLibraryAssetType
  category: string
  size_bytes: number
  version: string
  format: string | null
  url: string | null
  owner: string | null
  tags: string[]
  status: DataLibraryAssetStatus
  downloads: number
  views: number
  created_at: string
  updated_at: string
}

export type StoredFolderRecord = {
  id: number
  name: string
  path: string
  created_at: string
}

export type CreateAssetInput = {
  name: string
  description?: string | null
  type: DataLibraryAssetType
  category: string
  format?: string | null
  url?: string | null
  tags?: string[]
  owner?: string | null
}

export type CreateFolderInput = {
  name: string
  path?: string
}

const ASSET_TYPES: DataLibraryAssetType[] = [
  "dataset",
  "model",
  "dashboard",
  "report",
  "api",
  "document",
]

const ASSET_STATUSES: DataLibraryAssetStatus[] = ["active", "archived", "draft"]

function getBootstrapKey(client: PoolClient, suffix: string) {
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
    "data-library",
    suffix,
  ].join("::")
}

function readAssetType(value: unknown): DataLibraryAssetType | null {
  if (typeof value !== "string") return null
  return ASSET_TYPES.includes(value as DataLibraryAssetType)
    ? (value as DataLibraryAssetType)
    : null
}

function readAssetStatus(value: unknown): DataLibraryAssetStatus {
  if (typeof value === "string" && ASSET_STATUSES.includes(value as DataLibraryAssetStatus)) {
    return value as DataLibraryAssetStatus
  }
  return "active"
}

function readTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === "string")
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function serializeStoredAsset(record: StoredAssetRecord): DataLibraryCatalogAsset {
  return {
    id: `db:${record.id}`,
    name: record.name,
    description: record.description ?? "",
    type: record.asset_type,
    category: record.category,
    size: record.size_bytes,
    version: record.version,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    owner: record.owner ?? "Admin",
    tags: record.tags ?? [],
    status: record.status,
    downloads: record.downloads,
    views: record.views,
    url: record.url ?? undefined,
    format: record.format ?? undefined,
    derived: false,
  }
}

export function isDerivedAssetId(id: string): boolean {
  return !id.startsWith("db:")
}

export function parseStoredAssetId(id: string): number | null {
  if (!id.startsWith("db:")) return null
  const numeric = Number(id.slice(3))
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null
}

export async function ensureDataLibraryAssetsTable(client: PoolClient) {
  await ensureDbBootstrap(getBootstrapKey(client, "assets"), async () => {
    await ensureControlSchema(client)
    const tableRef = getQuotedDataLibraryAssetsTableRef()

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${tableRef} (
        id serial PRIMARY KEY,
        name text NOT NULL,
        description text NULL,
        asset_type text NOT NULL,
        category text NOT NULL DEFAULT 'Documentation',
        size_bytes bigint NOT NULL DEFAULT 0,
        version text NOT NULL DEFAULT '1.0.0',
        format text NULL,
        url text NULL,
        owner text NULL,
        tags text[] NOT NULL DEFAULT '{}',
        status text NOT NULL DEFAULT 'active',
        downloads integer NOT NULL DEFAULT 0,
        views integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT data_library_assets_type_check CHECK (
          asset_type IN ('dataset', 'model', 'dashboard', 'report', 'api', 'document')
        ),
        CONSTRAINT data_library_assets_status_check CHECK (
          status IN ('active', 'archived', 'draft')
        )
      )
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS ${quotePgIdentifier(`${DATA_LIBRARY_ASSETS_TABLE_NAME}_category_idx`)}
      ON ${tableRef} (category)
    `)
  })
}

export async function ensureDataLibraryFoldersTable(client: PoolClient) {
  await ensureDataLibraryAssetsTable(client)

  await ensureDbBootstrap(getBootstrapKey(client, "folders"), async () => {
    const tableRef = getQuotedDataLibraryFoldersTableRef()

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${tableRef} (
        id serial PRIMARY KEY,
        name text NOT NULL,
        path text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT data_library_folders_path_unique UNIQUE (path)
      )
    `)
  })
}

export async function listStoredAssets(client: PoolClient): Promise<StoredAssetRecord[]> {
  await ensureDataLibraryAssetsTable(client)
  const tableRef = getQuotedDataLibraryAssetsTableRef()

  const result = await client.query<StoredAssetRecord>(
    `
      SELECT
        id,
        name,
        description,
        asset_type,
        category,
        size_bytes,
        version,
        format,
        url,
        owner,
        tags,
        status,
        downloads,
        views,
        created_at::text,
        updated_at::text
      FROM ${tableRef}
      ORDER BY updated_at DESC, id DESC
    `
  )

  return result.rows
}

export async function listStoredFolders(client: PoolClient): Promise<StoredFolderRecord[]> {
  await ensureDataLibraryFoldersTable(client)
  const tableRef = getQuotedDataLibraryFoldersTableRef()

  const result = await client.query<StoredFolderRecord>(
    `
      SELECT id, name, path, created_at::text
      FROM ${tableRef}
      ORDER BY path, name
    `
  )

  return result.rows
}

type SchemaCatalogRow = {
  schema_name: string
  project_id: number | null
  project_ref: string | null
  project_name: string | null
  owner: string
  table_count: number
  total_size_bytes: string | number
  description: string | null
  updated_at: string | null
  status: string | null
}

async function loadSchemaCatalogRows(
  client: PoolClient,
  accessibleSchemas: Set<string>
): Promise<SchemaCatalogRow[]> {
  await ensureProjectsTable(client)
  await ensureProjectRoleAssignmentsTable(client)

  const result = await client.query<SchemaCatalogRow>(
    `
      SELECT
        n.nspname AS schema_name,
        projects.id AS project_id,
        projects.project_ref,
        projects.name AS project_name,
        COALESCE(pg_catalog.pg_get_userbyid(n.nspowner), 'unknown') AS owner,
        COUNT(DISTINCT c.oid) FILTER (
          WHERE c.relkind IN ('r', 'v', 'm', 'p') AND c.relname NOT LIKE 'pg_%'
        )::int AS table_count,
        COALESCE(SUM(pg_catalog.pg_total_relation_size(c.oid)), 0)::bigint AS total_size_bytes,
        COALESCE(projects.description, pg_catalog.obj_description(n.oid)) AS description,
        projects.updated_at::text AS updated_at,
        projects.status
      FROM pg_catalog.pg_namespace n
      LEFT JOIN pg_catalog.pg_class c
        ON c.relnamespace = n.oid
        AND c.relkind IN ('r', 'v', 'm', 'p')
        AND c.relname NOT LIKE 'pg_%'
        AND c.relname NOT LIKE 'sql_%'
      LEFT JOIN ${getQuotedProjectsTableRef()} projects
        ON projects.schema_name = n.nspname
      WHERE n.nspname NOT LIKE 'pg_%'
        AND n.nspname <> 'information_schema'
        AND n.nspname NOT LIKE '%backup%'
      GROUP BY
        n.nspname,
        n.nspowner,
        n.oid,
        projects.id,
        projects.project_ref,
        projects.name,
        projects.description,
        projects.updated_at,
        projects.status
      ORDER BY n.nspname
    `
  )

  return result.rows.filter((row) => accessibleSchemas.has(row.schema_name))
}

function buildDerivedAssets(
  schemas: SchemaCatalogRow[],
  teamsCount: number,
  controlSchema: string,
  ownerLabel: string
): DataLibraryCatalogAsset[] {
  const derived: DataLibraryCatalogAsset[] = []
  const now = new Date().toISOString()

  for (const schema of schemas) {
    const isProject = schema.project_id != null
    const sizeBytes = Number(schema.total_size_bytes) || 0
    const updatedAt = schema.updated_at ?? now
    const status =
      schema.status === "archived"
        ? "archived"
        : schema.status === "draft"
          ? "draft"
          : "active"

    derived.push({
      id: `schema:${schema.schema_name}`,
      name: isProject
        ? `${schema.project_name ?? schema.schema_name} — Schema Export`
        : `${schema.schema_name} — Full DDL Export`,
      description:
        schema.description ??
        (isProject
          ? `PostgreSQL schema for VM project ${schema.project_ref ?? schema.schema_name} (${schema.table_count} tables)`
          : `Tables, views, and materialized objects in schema ${schema.schema_name} (${schema.table_count} tables)`),
      type: "dataset",
      category: isProject ? "Project Exports" : "Schema Exports",
      size: sizeBytes,
      version: "1.0.0",
      createdAt: updatedAt,
      updatedAt,
      owner: schema.owner,
      tags: [
        "postgres",
        schema.schema_name,
        ...(isProject ? ["project", "vm"] : ["schema"]),
      ],
      status,
      downloads: 0,
      views: schema.table_count,
      format: "sql",
      url: `/admin/schemas/${encodeURIComponent(schema.schema_name)}`,
      derived: true,
    })

    if (isProject && schema.project_id != null) {
      derived.push({
        id: `api:project:${schema.project_id}`,
        name: `${schema.project_name ?? schema.schema_name} — REST API`,
        description: `PowerBase REST endpoints for tables in schema ${schema.schema_name}`,
        type: "api",
        category: "APIs & Integrations",
        size: 0,
        version: "1.0.0",
        createdAt: updatedAt,
        updatedAt,
        owner: schema.owner,
        tags: ["rest", "api", "powerbase", schema.schema_name],
        status: "active",
        downloads: 0,
        views: 0,
        url: `/api/projects/${schema.project_id}/rest/v1`,
        derived: true,
      })
    }
  }

  derived.push({
    id: "system:visualizer",
    name: "Schema Visualizer",
    description: "Explore entity-relationship diagrams and foreign keys across accessible schemas",
    type: "dashboard",
    category: "Visualizations",
    size: 0,
    version: "1.0.0",
    createdAt: now,
    updatedAt: now,
    owner: ownerLabel,
    tags: ["erd", "visualizer", "schemas"],
    status: "active",
    downloads: 0,
    views: schemas.length,
    url: "/admin/schemas/visualizer",
    derived: true,
  })

  derived.push({
    id: "system:teams-access",
    name: "Team & Schema Access Overview",
    description: `${teamsCount} team(s) with project assignments and synced PostgreSQL privileges`,
    type: "report",
    category: "Compliance",
    size: 0,
    version: "1.0.0",
    createdAt: now,
    updatedAt: now,
    owner: ownerLabel,
    tags: ["teams", "rbac", "privileges"],
    status: "active",
    downloads: 0,
    views: teamsCount,
    url: "/admin/team",
    derived: true,
  })

  derived.push({
    id: "system:control-schema",
    name: `${controlSchema} — Control Schema`,
    description: `Platform metadata tables (projects, teams, settings) live in ${controlSchema}`,
    type: "document",
    category: "Documentation",
    size: 0,
    version: "1.0.0",
    createdAt: now,
    updatedAt: now,
    owner: ownerLabel,
    tags: ["control_schema", "platform", controlSchema],
    status: "active",
    downloads: 0,
    views: 0,
    url: "/admin/schemas",
    format: "sql",
    derived: true,
  })

  return derived
}

function buildFoldersFromAssets(
  assets: DataLibraryCatalogAsset[],
  storedFolders: StoredFolderRecord[]
): DataLibraryCatalogFolder[] {
  const categoryCounts = new Map<string, number>()
  for (const asset of assets) {
    categoryCounts.set(asset.category, (categoryCounts.get(asset.category) ?? 0) + 1)
  }

  const derivedFolders: DataLibraryCatalogFolder[] = Array.from(categoryCounts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, count]) => ({
      id: `category:${name}`,
      name,
      path: `/${name.toLowerCase().replace(/\s+/g, "-")}`,
      assetCount: count,
      createdAt: new Date().toISOString(),
    }))

  const customFolders: DataLibraryCatalogFolder[] = storedFolders.map((folder) => ({
    id: `db-folder:${folder.id}`,
    name: folder.name,
    path: folder.path,
    assetCount: assets.filter(
      (asset) =>
        asset.category.toLowerCase() === folder.name.toLowerCase() ||
        asset.tags.includes(folder.name.toLowerCase())
    ).length,
    createdAt: folder.created_at,
  }))

  const seen = new Set<string>()
  return [...customFolders, ...derivedFolders].filter((folder) => {
    if (seen.has(folder.path)) return false
    seen.add(folder.path)
    return true
  })
}

export async function countDataLibraryAssets(
  client: PoolClient,
  session: PrincipalSession
): Promise<number> {
  await ensureDataLibraryAssetsTable(client)
  const accessibleSchemas = await getAccessibleSchemaNamesForPrincipal(client, session)
  const schemaRows = await loadSchemaCatalogRows(client, accessibleSchemas)
  const storedAssets = await listStoredAssets(client)

  let derivedCount = schemaRows.length + 3
  for (const schema of schemaRows) {
    if (schema.project_id != null) {
      derivedCount += 1
    }
  }

  return storedAssets.length + derivedCount
}

export async function buildDataLibraryCatalog(
  client: PoolClient,
  session: PrincipalSession
): Promise<{ assets: DataLibraryCatalogAsset[]; folders: DataLibraryCatalogFolder[] }> {
  await ensureDataLibraryFoldersTable(client)
  await ensureTeamsTable(client)

  const accessibleSchemas = await getAccessibleSchemaNamesForPrincipal(client, session)
  const schemaRows = await loadSchemaCatalogRows(client, accessibleSchemas)
  const storedAssets = await listStoredAssets(client)
  const storedFolders = await listStoredFolders(client)
  const teams = await listTeams(client)

  const ownerLabel =
    session.principalType === "db_user" ? session.username : session.email

  const derived = buildDerivedAssets(
    schemaRows,
    teams.length,
    getControlSchema(),
    ownerLabel
  )
  const stored = storedAssets.map(serializeStoredAsset)

  const assets = [...stored, ...derived].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  )

  return {
    assets,
    folders: buildFoldersFromAssets(assets, storedFolders),
  }
}

export async function createStoredAsset(
  client: PoolClient,
  input: CreateAssetInput
): Promise<DataLibraryCatalogAsset> {
  await ensureDataLibraryAssetsTable(client)
  const tableRef = getQuotedDataLibraryAssetsTableRef()
  const assetType = readAssetType(input.type)
  if (!assetType) {
    throw new Error("Invalid asset type")
  }

  const name = input.name.trim()
  if (!name) {
    throw new Error("Asset name is required")
  }

  const category = (input.category || "Documentation").trim() || "Documentation"

  const result = await client.query<StoredAssetRecord>(
    `
      INSERT INTO ${tableRef} (
        name,
        description,
        asset_type,
        category,
        format,
        url,
        owner,
        tags,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
      RETURNING
        id,
        name,
        description,
        asset_type,
        category,
        size_bytes,
        version,
        format,
        url,
        owner,
        tags,
        status,
        downloads,
        views,
        created_at::text,
        updated_at::text
    `,
    [
      name,
      input.description?.trim() || null,
      assetType,
      category,
      input.format?.trim() || null,
      input.url?.trim() || null,
      input.owner?.trim() || "Admin",
      readTags(input.tags),
    ]
  )

  const record = result.rows[0]
  if (!record) {
    throw new Error("Failed to create asset")
  }

  return serializeStoredAsset(record)
}

export async function createStoredFolder(
  client: PoolClient,
  input: CreateFolderInput
): Promise<DataLibraryCatalogFolder> {
  await ensureDataLibraryFoldersTable(client)
  const tableRef = getQuotedDataLibraryFoldersTableRef()

  const name = input.name.trim()
  if (!name) {
    throw new Error("Folder name is required")
  }

  const parentPath = (input.path ?? "/").trim() || "/"
  const path =
    parentPath === "/"
      ? `/${name.toLowerCase().replace(/\s+/g, "-")}`
      : `${parentPath.replace(/\/$/, "")}/${name.toLowerCase().replace(/\s+/g, "-")}`

  const result = await client.query<StoredFolderRecord>(
    `
      INSERT INTO ${tableRef} (name, path)
      VALUES ($1, $2)
      ON CONFLICT (path) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, name, path, created_at::text
    `,
    [name, path]
  )

  const record = result.rows[0]
  if (!record) {
    throw new Error("Failed to create folder")
  }

  return {
    id: `db-folder:${record.id}`,
    name: record.name,
    path: record.path,
    assetCount: 0,
    createdAt: record.created_at,
  }
}

export async function deleteStoredAsset(client: PoolClient, id: number): Promise<boolean> {
  await ensureDataLibraryAssetsTable(client)
  const tableRef = getQuotedDataLibraryAssetsTableRef()
  const result = await client.query(
    `DELETE FROM ${tableRef} WHERE id = $1`,
    [id]
  )
  return (result.rowCount ?? 0) > 0
}

export async function incrementAssetViews(client: PoolClient, id: number): Promise<void> {
  await ensureDataLibraryAssetsTable(client)
  const tableRef = getQuotedDataLibraryAssetsTableRef()
  await client.query(
    `
      UPDATE ${tableRef}
      SET views = views + 1, updated_at = now()
      WHERE id = $1
    `,
    [id]
  )
}

export function readCreateAssetBody(body: Record<string, unknown>): CreateAssetInput | null {
  const name = typeof body.name === "string" ? body.name : ""
  const type = readAssetType(body.type)
  if (!type) return null

  return {
    name,
    description: typeof body.description === "string" ? body.description : null,
    type,
    category: typeof body.category === "string" ? body.category : "Documentation",
    format: typeof body.format === "string" ? body.format : null,
    url: typeof body.url === "string" ? body.url : null,
    tags: readTags(body.tags),
    owner: typeof body.owner === "string" ? body.owner : null,
  }
}

export function readCreateFolderBody(body: Record<string, unknown>): CreateFolderInput | null {
  const name = typeof body.name === "string" ? body.name.trim() : ""
  if (!name) return null
  return {
    name,
    path: typeof body.path === "string" ? body.path : "/",
  }
}
