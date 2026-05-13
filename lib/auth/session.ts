import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { getControlSchema } from "@/lib/control-schema"

const SESSION_COOKIE_NAME = "powerbase_admin_session"
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12

export type AdminSession = {
  id: number
  email: string
  controlSchema: string
  iat: number
  exp: number
}

function getFallbackSecret() {
  const seed = `${process.env.DATABASE_URL ?? ""}|${process.cwd()}|powerbase-admin-session`
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

function encodePayload(payload: AdminSession): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
}

function decodePayload(value: string): AdminSession | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown
    if (!parsed || typeof parsed !== "object") return null
    const data = parsed as Record<string, unknown>
    if (
      typeof data.id !== "number" ||
      !Number.isInteger(data.id) ||
      data.id < 1 ||
      typeof data.email !== "string" ||
      typeof data.controlSchema !== "string" ||
      typeof data.iat !== "number" ||
      typeof data.exp !== "number"
    ) {
      return null
    }
    return {
      id: data.id,
      email: data.email,
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

export function createAdminSession(input: {
  id: number
  email: string
  controlSchema: string
}): AdminSession {
  const iat = Math.floor(Date.now() / 1000)
  return {
    id: input.id,
    email: input.email,
    controlSchema: input.controlSchema,
    iat,
    exp: iat + SESSION_MAX_AGE_SECONDS,
  }
}

export function createAdminSessionToken(session: AdminSession): string {
  const payload = encodePayload(session)
  return `${payload}.${signPayload(payload)}`
}

export function verifyAdminSessionToken(token: string | null | undefined): AdminSession | null {
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

export function getAdminSessionFromRequest(
  request: Request | { headers: Headers }
): AdminSession | null {
  const token = getCookieValue(request.headers.get("cookie"), SESSION_COOKIE_NAME)
  return verifyAdminSessionToken(token)
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies()
  return verifyAdminSessionToken(store.get(SESSION_COOKIE_NAME)?.value)
}

export function setAdminSessionCookie(response: NextResponse, session: AdminSession): NextResponse {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: createAdminSessionToken(session),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  })
  return response
}

export function clearAdminSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  })
  return response
}

export function unauthorizedJson(message = "Unauthorized") {
  return NextResponse.json({ success: false, error: message }, { status: 401 })
}

export function requireAdminRequest(
  request: Request | { headers: Headers }
): { ok: true; session: AdminSession } | { ok: false; response: NextResponse } {
  const session = getAdminSessionFromRequest(request)
  if (!session) {
    return { ok: false, response: unauthorizedJson() }
  }
  return { ok: true, session }
}

export function adminSessionPublicUser(session: AdminSession) {
  return {
    id: session.id,
    email: session.email,
    controlSchema: session.controlSchema,
  }
}
