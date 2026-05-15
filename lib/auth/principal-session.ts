import { NextResponse } from "next/server"
import {
  AdminSession,
  getAdminSessionFromRequest,
  unauthorizedJson,
} from "@/lib/auth/session"
import { DbUserSession, getDbUserSessionFromRequest } from "@/lib/auth/db-user-session"

export type PrincipalSession =
  | (AdminSession & { principalType: "superadmin" })
  | (DbUserSession & { principalType: "db_user" })

export function getPrincipalSessionFromRequest(
  request: Request | { headers: Headers }
): PrincipalSession | null {
  const adminSession = getAdminSessionFromRequest(request)
  if (adminSession) {
    return {
      ...adminSession,
      principalType: "superadmin",
    }
  }

  const dbUserSession = getDbUserSessionFromRequest(request)
  if (dbUserSession) {
    return {
      ...dbUserSession,
      principalType: "db_user",
    }
  }

  return null
}

export function requirePrincipalRequest(
  request: Request | { headers: Headers }
): { ok: true; session: PrincipalSession } | { ok: false; response: NextResponse } {
  const session = getPrincipalSessionFromRequest(request)
  if (!session) {
    return { ok: false, response: unauthorizedJson() }
  }

  return { ok: true, session }
}
