import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { useSecureSessionCookies } from "@/lib/auth/cookie-secure"
import { getControlSchema } from "@/lib/control-schema"

const SESSION_COOKIE_NAME = "powerbase_db_user_session"
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12

export type DbUserSession = {
  id: number
  username: string
  controlSchema: string
  iat: number
  exp: number
}

function getFallbackSecret() {
  const seed = `${process.env.DATABASE_URL ?? ""}|${process.cwd()}|powerbase-db-user-session`
  return createHash("sha256").update(seed).digest("base64url")
}

function getSessionSecret() {
  return (
    process.env.AUTH_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    getFallbackSecret()
  )
}

function encodePayload(payload: DbUserSession): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
}

function decodePayload(value: string): DbUserSession | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown
    if (!parsed || typeof parsed !== "object") return null
    const data = parsed as Record<string, unknown>
    if (
      typeof data.id !== "number" ||
      !Number.isInteger(data.id) ||
      data.id < 1 ||
      typeof data.username !== "string" ||
      typeof data.controlSchema !== "string" ||
      typeof data.iat !== "number" ||
      typeof data.exp !== "number"
    ) {
      return null
    }
    return {
      id: data.id,
      username: data.username,
      controlSchema: data.controlSchema,
      iat: data.iat,
      exp: data.exp,
    }
  } catch {
    return null
  }
}

function signPayload(encodedPayload: string): string {
  return createHmac("sha256", getSessionSecret()).update(encodedPayload).digest("base64url")
}

function splitToken(token: string): { payload: string; signature: string } | null {
  const parts = token.split(".")
  if (parts.length !== 2) return null
  return { payload: parts[0], signature: parts[1] }
}

export function createDbUserSession(input: {
  id: number
  username: string
  controlSchema: string
}): DbUserSession {
  const iat = Math.floor(Date.now() / 1000)
  return {
    id: input.id,
    username: input.username,
    controlSchema: input.controlSchema,
    iat,
    exp: iat + SESSION_MAX_AGE_SECONDS,
  }
}

export function createDbUserSessionToken(session: DbUserSession): string {
  const payload = encodePayload(session)
  return `${payload}.${signPayload(payload)}`
}

export function verifyDbUserSessionToken(token: string | null | undefined): DbUserSession | null {
  if (!token) return null
  const parts = splitToken(token)
  if (!parts) return null

  const actual = Buffer.from(parts.signature)
  const expected = Buffer.from(signPayload(parts.payload))
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null
  }

  const session = decodePayload(parts.payload)
  if (!session) return null
  if (session.exp <= Math.floor(Date.now() / 1000)) {
    return null
  }
  if (session.controlSchema !== getControlSchema()) {
    return null
  }
  return session
}

function getCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null
  const entries = cookieHeader.split(";")
  for (const entry of entries) {
    const [rawName, ...rest] = entry.trim().split("=")
    if (rawName === name) {
      return rest.join("=")
    }
  }
  return null
}

export function getDbUserSessionFromRequest(
  request: Request | { headers: Headers }
): DbUserSession | null {
  const token = getCookieValue(request.headers.get("cookie"), SESSION_COOKIE_NAME)
  return verifyDbUserSessionToken(token)
}

export async function getDbUserSession(): Promise<DbUserSession | null> {
  const store = await cookies()
  return verifyDbUserSessionToken(store.get(SESSION_COOKIE_NAME)?.value)
}

export function setDbUserSessionCookie(
  response: NextResponse,
  session: DbUserSession
): NextResponse {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: createDbUserSessionToken(session),
    httpOnly: true,
    sameSite: "lax",
    secure: useSecureSessionCookies(),
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  })
  return response
}

export function clearDbUserSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: useSecureSessionCookies(),
    maxAge: 0,
    path: "/",
  })
  return response
}

export function dbUserSessionPublicUser(session: DbUserSession) {
  return {
    id: session.id,
    username: session.username,
    controlSchema: session.controlSchema,
  }
}
