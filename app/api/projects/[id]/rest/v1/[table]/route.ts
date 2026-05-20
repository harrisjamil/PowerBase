import { NextRequest, NextResponse } from "next/server"
import { getPool } from "@/lib/db"
import { isSafePgIdentifier } from "@/lib/control-schema"
import { parseProjectLookup } from "@/lib/project-ref"
import {
  canRoleDelete,
  canRoleInsert,
  canRoleRead,
  canRoleUpdate,
  getRestCorsHeaders,
  readProjectApiKeyFromRequest,
  unauthorizedApiKeyJson,
  verifyProjectApiKey,
} from "@/lib/project-api-key-auth"
import {
  missingPgCredentialsJson,
  readRestPgCredentialsFromRequest,
  verifyRestPgUserForSchema,
} from "@/lib/rest-pg-user-auth"
import {
  deleteTableRows,
  insertTableRow,
  parseEqFilters,
  SchemaTableRequestError,
  selectTableRows,
  updateTableRows,
} from "@/lib/schema-table-rest"

function jsonWithCors(request: NextRequest, body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: getRestCorsHeaders(request),
  })
}

function respondWithCors(response: NextResponse, request: NextRequest) {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(getRestCorsHeaders(request))) {
    headers.set(key, value)
  }
  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

async function authenticate(
  request: NextRequest,
  projectLookup: string
) {
  const token = readProjectApiKeyFromRequest(request)
  if (!token) {
    return { ok: false as const, response: respondWithCors(unauthorizedApiKeyJson(), request) }
  }

  if (!parseProjectLookup(projectLookup)) {
    return {
      ok: false as const,
      response: jsonWithCors(request, { message: "Invalid project ID" }, 400),
    }
  }

  const client = await getPool().connect()
  try {
    const auth = await verifyProjectApiKey(client, token)
    if (!auth) {
      client.release()
      return { ok: false as const, response: respondWithCors(unauthorizedApiKeyJson(), request) }
    }

    if (auth.project.project_ref !== projectLookup && String(auth.project.id) !== projectLookup) {
      client.release()
      return {
        ok: false as const,
        response: jsonWithCors(request, { message: "API key does not match this project" }, 403),
      }
    }

    const pgCredentials = readRestPgCredentialsFromRequest(request)
    if (!pgCredentials) {
      client.release()
      return {
        ok: false as const,
        response: respondWithCors(missingPgCredentialsJson(), request),
      }
    }

    const pgAuth = await verifyRestPgUserForSchema(
      client,
      auth.project.schema_name,
      pgCredentials
    )
    if (!pgAuth.ok) {
      client.release()
      return {
        ok: false as const,
        response: jsonWithCors(request, { message: pgAuth.message }, pgAuth.status),
      }
    }

    return { ok: true as const, client, auth, pgUser: pgAuth.context.pgUser }
  } catch (error) {
    client.release()
    throw error
  }
}

function readLimit(searchParams: URLSearchParams) {
  const raw = searchParams.get("limit")
  if (!raw) return 1000
  const limit = Number(raw)
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new SchemaTableRequestError("limit must be an integer between 1 and 1000.")
  }
  return limit
}

function readOffset(searchParams: URLSearchParams) {
  const raw = searchParams.get("offset")
  if (!raw) return 0
  const offset = Number(raw)
  if (!Number.isInteger(offset) || offset < 0) {
    throw new SchemaTableRequestError("offset must be a non-negative integer.")
  }
  return offset
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: getRestCorsHeaders(request),
  })
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; table: string }> }
) {
  const { id, table } = await context.params

  if (!isSafePgIdentifier(table)) {
    return jsonWithCors(request, { message: "Invalid table name." }, 400)
  }

  const authResult = await authenticate(request, id)
  if (!authResult.ok) {
    return authResult.response
  }

  const { client, auth } = authResult

  if (!canRoleRead(auth.role)) {
    client.release()
    return jsonWithCors(request, { message: "This key cannot read data." }, 403)
  }

  try {
    const filters = parseEqFilters(request.nextUrl.searchParams)
    const rows = await selectTableRows(client, auth.project.schema_name, table, {
      filters,
      limit: readLimit(request.nextUrl.searchParams),
      offset: readOffset(request.nextUrl.searchParams),
      order: request.nextUrl.searchParams.get("order") ?? undefined,
    })

    return jsonWithCors(request, rows)
  } catch (error) {
    if (error instanceof SchemaTableRequestError) {
      return jsonWithCors(request, { message: error.message }, error.status)
    }
    console.error("REST GET error:", error)
    return jsonWithCors(
      request,
      { message: errorMessage(error, "Failed to fetch rows") },
      500
    )
  } finally {
    client.release()
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; table: string }> }
) {
  const { id, table } = await context.params

  if (!isSafePgIdentifier(table)) {
    return jsonWithCors(request, { message: "Invalid table name." }, 400)
  }

  const authResult = await authenticate(request, id)
  if (!authResult.ok) {
    return authResult.response
  }

  const { client, auth } = authResult

  if (!canRoleInsert(auth.role)) {
    client.release()
    return jsonWithCors(request, { message: "This key cannot insert data." }, 403)
  }

  try {
    const body = (await request.json()) as unknown
    const payload = Array.isArray(body) ? body[0] : body
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new SchemaTableRequestError("Request body must be a JSON object.")
    }

    const row = await insertTableRow(
      client,
      auth.project.schema_name,
      table,
      payload as Record<string, unknown>
    )

    return jsonWithCors(request, row ? [row] : [], 201)
  } catch (error) {
    if (error instanceof SchemaTableRequestError) {
      return jsonWithCors(request, { message: error.message }, error.status)
    }
    console.error("REST POST error:", error)
    return jsonWithCors(
      request,
      { message: errorMessage(error, "Failed to insert row") },
      500
    )
  } finally {
    client.release()
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; table: string }> }
) {
  const { id, table } = await context.params

  if (!isSafePgIdentifier(table)) {
    return jsonWithCors(request, { message: "Invalid table name." }, 400)
  }

  const authResult = await authenticate(request, id)
  if (!authResult.ok) {
    return authResult.response
  }

  const { client, auth } = authResult

  if (!canRoleUpdate(auth.role)) {
    client.release()
    return jsonWithCors(
      request,
      {
        message:
          "anon key cannot update rows. Use service_role on the server or enable update policies.",
      },
      403
    )
  }

  try {
    const filters = parseEqFilters(request.nextUrl.searchParams)
    const body = (await request.json()) as unknown
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new SchemaTableRequestError("Request body must be a JSON object.")
    }

    const rows = await updateTableRows(
      client,
      auth.project.schema_name,
      table,
      filters,
      body as Record<string, unknown>
    )

    return jsonWithCors(request, rows)
  } catch (error) {
    if (error instanceof SchemaTableRequestError) {
      return jsonWithCors(request, { message: error.message }, error.status)
    }
    console.error("REST PATCH error:", error)
    return jsonWithCors(
      request,
      { message: errorMessage(error, "Failed to update rows") },
      500
    )
  } finally {
    client.release()
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; table: string }> }
) {
  const { id, table } = await context.params

  if (!isSafePgIdentifier(table)) {
    return jsonWithCors(request, { message: "Invalid table name." }, 400)
  }

  const authResult = await authenticate(request, id)
  if (!authResult.ok) {
    return authResult.response
  }

  const { client, auth } = authResult

  if (!canRoleDelete(auth.role)) {
    client.release()
    return jsonWithCors(
      request,
      {
        message:
          "anon key cannot delete rows. Use service_role on the server.",
      },
      403
    )
  }

  try {
    const filters = parseEqFilters(request.nextUrl.searchParams)
    const rows = await deleteTableRows(client, auth.project.schema_name, table, filters)
    return jsonWithCors(request, rows)
  } catch (error) {
    if (error instanceof SchemaTableRequestError) {
      return jsonWithCors(request, { message: error.message }, error.status)
    }
    console.error("REST DELETE error:", error)
    return jsonWithCors(
      request,
      { message: errorMessage(error, "Failed to delete rows") },
      500
    )
  } finally {
    client.release()
  }
}
