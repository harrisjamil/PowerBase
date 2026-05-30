import type { PoolClient } from "pg"
import { NextResponse } from "next/server"
import { isSafePgIdentifier } from "@/lib/control-schema"
import { canPgUserAccessProjectSchema } from "@/lib/teams"
import { authenticatePostgresRole } from "@/lib/postgres-roles"

export type RestPgCredentials = {
  user: string
  password: string
}

export type RestPgAuthContext = {
  pgUser: string
}

export function readRestPgCredentialsFromRequest(request: Request): RestPgCredentials | null {
  const headerUser = request.headers.get("x-powerbase-pg-user")?.trim()
  const headerPassword = request.headers.get("x-powerbase-pg-password")
  if (headerUser && headerPassword !== null && headerPassword.length > 0) {
    return { user: headerUser, password: headerPassword }
  }

  const envUser = process.env.POWERBASE_REST_PG_USER?.trim()
  const envPassword = process.env.POWERBASE_REST_PG_PASSWORD
  const allowEnvFallback =
    process.env.NODE_ENV !== "production" &&
    process.env.POWERBASE_REST_ALLOW_ENV_PG?.trim() === "1"
  if (allowEnvFallback && envUser && envPassword !== undefined && envPassword.length > 0) {
    return { user: envUser, password: envPassword }
  }

  return null
}

export function missingPgCredentialsJson() {
  return NextResponse.json(
    {
      message: "PostgreSQL user verification is required",
      hint: "Send x-powerbase-pg-user and x-powerbase-pg-password headers, or set POWERBASE_REST_PG_USER and POWERBASE_REST_PG_PASSWORD in the server environment. The user must be assigned to this project schema in PowerBase.",
    },
    { status: 401 }
  )
}

export async function verifyRestPgUserForSchema(
  client: PoolClient,
  schemaName: string,
  credentials: RestPgCredentials
): Promise<
  | { ok: true; context: RestPgAuthContext }
  | { ok: false; message: string; status: number }
> {
  if (!isSafePgIdentifier(credentials.user)) {
    return { ok: false, message: "Invalid PostgreSQL username.", status: 400 }
  }

  const passwordValid = await authenticatePostgresRole(credentials.user, credentials.password)
  if (!passwordValid) {
    return {
      ok: false,
      message: "Invalid PostgreSQL user credentials.",
      status: 401,
    }
  }

  const hasSchemaAccess = await canPgUserAccessProjectSchema(
    client,
    credentials.user,
    schemaName
  )
  if (!hasSchemaAccess) {
    return {
      ok: false,
      message: `PostgreSQL user "${credentials.user}" is not assigned to this project schema.`,
      status: 403,
    }
  }

  return { ok: true, context: { pgUser: credentials.user } }
}
