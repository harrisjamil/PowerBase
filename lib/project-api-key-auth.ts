import { timingSafeEqual } from "node:crypto"
import type { PoolClient } from "pg"
import { NextResponse } from "next/server"
import { getQuotedProjectApiKeysTableRef } from "@/lib/control-schema"
import {
  ensureProjectApiKeysTable,
  listProjectApiKeys,
  type ProjectApiKeyType,
} from "@/lib/project-api-keys"
import { ensureProjectsTable, getProjectRecordByRef, type ProjectRecord } from "@/lib/projects"

export type ProjectApiAuthContext = {
  project: ProjectRecord
  role: ProjectApiKeyType
}

type JwtPayload = {
  iss?: string
  ref?: string
  role?: ProjectApiKeyType
  exp?: number
}

function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.split(".")
  if (parts.length !== 3) return null

  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as JwtPayload
  } catch {
    return null
  }
}

function tokensEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  if (leftBuffer.length !== rightBuffer.length) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}

export function readProjectApiKeyFromRequest(request: Request): string | null {
  const authorization = request.headers.get("authorization")?.trim()
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice(7).trim()
    if (token) return token
  }

  const apiKey = request.headers.get("apikey")?.trim()
  if (apiKey) return apiKey

  return null
}

export async function verifyProjectApiKey(
  client: PoolClient,
  token: string
): Promise<ProjectApiAuthContext | null> {
  const payload = decodeJwtPayload(token)
  if (
    !payload ||
    payload.iss !== "powerbase" ||
    typeof payload.ref !== "string" ||
    (payload.role !== "anon" && payload.role !== "service_role") ||
    typeof payload.exp !== "number" ||
    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    return null
  }

  await ensureProjectsTable(client)
  await ensureProjectApiKeysTable(client)

  const project = await getProjectRecordByRef(client, payload.ref)
  if (!project) return null

  const keys = await listProjectApiKeys(client, project.id)
  const stored = keys.find((entry) => entry.type === payload.role)
  if (!stored || !tokensEqual(stored.key, token)) {
    return null
  }

  await client.query(
    `
      UPDATE ${getQuotedProjectApiKeysTableRef()}
      SET last_used_at = now()
      WHERE project_id = $1
        AND key_type = $2
    `,
    [project.id, payload.role]
  )

  return { project, role: payload.role }
}

export function unauthorizedApiKeyJson() {
  return NextResponse.json(
    {
      message: "Invalid API key",
      hint: "Use Authorization: Bearer <anon or service_role key> or apikey header",
    },
    { status: 401 }
  )
}

export function forbiddenApiKeyJson(message: string) {
  return NextResponse.json({ message }, { status: 403 })
}

export function canRoleRead(role: ProjectApiKeyType) {
  return role === "anon" || role === "service_role"
}

export function canRoleInsert(role: ProjectApiKeyType) {
  return role === "anon" || role === "service_role"
}

export function canRoleUpdate(role: ProjectApiKeyType) {
  return role === "service_role"
}

export function canRoleDelete(role: ProjectApiKeyType) {
  return role === "service_role"
}

export function getRestCorsHeaders(request: Request) {
  const origin = request.headers.get("origin")
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, apikey, x-client-info, prefer, accept-profile, content-profile, x-powerbase-pg-user, x-powerbase-pg-password",
    "Access-Control-Max-Age": "86400",
  }
}
