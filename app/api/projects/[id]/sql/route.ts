import { NextRequest, NextResponse } from "next/server"
import type { QueryResult } from "pg"
import { requirePrincipalRequest } from "@/lib/auth/principal-session"
import { getPool } from "@/lib/db"
import { quotePgIdentifier } from "@/lib/control-schema"
import { canPrincipalAccessSchema } from "@/lib/principal-access"
import { ensureProjectsTable, getProjectRecordById } from "@/lib/projects"
import { validateProjectSqlQuery } from "@/lib/sql-query-guard"

const MAX_ROWS = 1000
const STATEMENT_TIMEOUT_MS = 30_000

type SqlRequestBody = {
  query?: unknown
  explain?: unknown
}

function readId(value: string): number | null {
  if (/^\d+$/.test(value)) {
    return Number(value)
  }
  return null
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function isSelectLike(command: string | undefined): boolean {
  if (!command) return false
  return command === "SELECT" || command.startsWith("SHOW") || command.startsWith("EXPLAIN")
}

function buildColumns(rows: Record<string, unknown>[]): string[] {
  if (rows.length === 0) {
    return []
  }
  return Object.keys(rows[0])
}

function stripLeadingExplain(sql: string): string {
  return sql.replace(/^\s*explain\s+(\([^)]*\)\s*)?/i, "").trim()
}

function buildExplainPlanText(rows: QueryResult["rows"]): string {
  return rows
    .map((row) => {
      const record = row as Record<string, unknown>
      const value = record["QUERY PLAN"] ?? record["query plan"] ?? Object.values(record)[0]
      return typeof value === "string" ? value : JSON.stringify(value)
    })
    .join("\n")
}

function parseExplainMetrics(plan: string) {
  const planningMatch = plan.match(/Planning Time:\s*([\d.]+)\s*ms/i)
  const executionMatch = plan.match(/Execution Time:\s*([\d.]+)\s*ms/i)
  const costMatch = plan.match(/\(cost=([\d.]+)\.\.([\d.]+)/i)
  const rowsMatch = plan.match(/rows=(\d+)/i)

  return {
    planningTimeMs: planningMatch ? Number(planningMatch[1]) : null,
    executionTimeMs: executionMatch ? Number(executionMatch[1]) : null,
    startupCost: costMatch ? Number(costMatch[1]) : null,
    totalCost: costMatch ? Number(costMatch[2]) : null,
    estimatedRows: rowsMatch ? Number(rowsMatch[1]) : null,
  }
}

async function listDatabaseSchemaNames(client: import("pg").PoolClient) {
  const result = await client.query<{ schema_name: string }>(
    `
      SELECT nspname AS schema_name
      FROM pg_catalog.pg_namespace
      WHERE nspname NOT LIKE 'pg_temp_%'
        AND nspname NOT LIKE 'pg_toast_temp_%'
    `
  )
  return result.rows.map((row) => row.schema_name)
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = requirePrincipalRequest(request)
  if (!auth.ok) return auth.response

  const { id: rawId } = await context.params
  const id = readId(rawId)
  if (!id) {
    return NextResponse.json(
      { success: false, error: "Invalid project ID" },
      { status: 400 }
    )
  }

  let body: SqlRequestBody
  try {
    body = (await request.json()) as SqlRequestBody
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    )
  }

  const query = typeof body.query === "string" ? body.query.trim() : ""
  const explain = body.explain === true

  const client = await getPool().connect()
  const startedAt = Date.now()

  try {
    await ensureProjectsTable(client)
    const project = await getProjectRecordById(client, id)
    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      )
    }

    if (!(await canPrincipalAccessSchema(client, auth.session, project.schema_name))) {
      return NextResponse.json(
        { success: false, error: "You do not have access to this project." },
        { status: 403 }
      )
    }

    const knownSchemas = await listDatabaseSchemaNames(client)
    const validation = validateProjectSqlQuery(query, project.schema_name, knownSchemas)
    if (!validation.ok) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      )
    }

    const explainTarget = stripLeadingExplain(query)
    const sqlToRun = explain ? `EXPLAIN (FORMAT TEXT) ${explainTarget}` : query

    await client.query("BEGIN")
    await client.query(`SET LOCAL search_path TO ${quotePgIdentifier(project.schema_name)}`)
    await client.query(`SET LOCAL statement_timeout TO ${STATEMENT_TIMEOUT_MS}`)

    const result: QueryResult = await client.query(sqlToRun)
    await client.query("COMMIT")

    const executionTime = Date.now() - startedAt
    const command = result.command ?? undefined

    if (explain) {
      const explainPlan = buildExplainPlanText(result.rows)
      const metrics = parseExplainMetrics(explainPlan)

      return NextResponse.json({
        success: true,
        message: "Explain plan generated",
        explainPlan,
        explainMetrics: metrics,
        executionTime,
      })
    }

    if (isSelectLike(command) && Array.isArray(result.rows)) {
      const rows = result.rows.slice(0, MAX_ROWS) as Record<string, unknown>[]
      const columns = buildColumns(rows)

      return NextResponse.json({
        success: true,
        message: `Query returned ${result.rowCount ?? rows.length} row(s)`,
        rows,
        columns,
        rowCount: result.rowCount ?? rows.length,
        executionTime,
        truncated: (result.rowCount ?? rows.length) > MAX_ROWS,
      })
    }

    return NextResponse.json({
      success: true,
      message: result.command
        ? `${result.command}${typeof result.rowCount === "number" ? ` ${result.rowCount}` : ""}`
        : "Query executed successfully",
      rowCount: result.rowCount ?? 0,
      executionTime,
    })
  } catch (error) {
    try {
      await client.query("ROLLBACK")
    } catch {
      // ignore rollback errors
    }

    console.error("Project SQL execution error:", error)
    return NextResponse.json(
      {
        success: false,
        error: errorMessage(error, "Failed to execute SQL query"),
        executionTime: Date.now() - startedAt,
      },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
