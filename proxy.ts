import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { getAdminSessionFromRequest } from "@/lib/auth/session"
import { getDbUserSessionFromRequest } from "@/lib/auth/db-user-session"

function isAdminLoginPath(pathname: string) {
  return pathname === "/admin/login" || pathname === "/login"
}

function isClientLoginPath(pathname: string) {
  return pathname === "/client/login"
}

function isPublicAdminPath(pathname: string) {
  return isAdminLoginPath(pathname) || pathname === "/admin/register"
}

function isPublicClientPath(pathname: string) {
  return isClientLoginPath(pathname) || pathname === "/client/register"
}

function isPublicAgentApiPath(pathname: string) {
  return (
    pathname === "/api/agents/login" ||
    pathname === "/api/agents/logout" ||
    pathname === "/api/agents/session"
  )
}

function isPublicDbUserApiPath(pathname: string) {
  return (
    pathname === "/api/db-users/login" ||
    pathname === "/api/db-users/logout" ||
    pathname === "/api/db-users/session"
  )
}

function isAgentReadableApiPath(pathname: string, method: string) {
  if (method !== "GET") {
    return false
  }

  return (
    pathname === "/api/schemas" ||
    pathname.startsWith("/api/schemas/") ||
    pathname === "/api/projects"
  )
}

function unauthorizedApiResponse() {
  return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const adminSession = getAdminSessionFromRequest(request)
  const dbUserSession = getDbUserSessionFromRequest(request)

  if (isAdminLoginPath(pathname)) {
    if (adminSession) {
      return NextResponse.redirect(new URL("/admin/dashboard", request.url))
    }
    return NextResponse.next()
  }

  if (isClientLoginPath(pathname)) {
    if (dbUserSession) {
      return NextResponse.redirect(new URL("/client/dashboard", request.url))
    }
    return NextResponse.next()
  }

  if (pathname.startsWith("/admin")) {
    if (!isPublicAdminPath(pathname) && !adminSession) {
      const loginUrl = new URL("/admin/login", request.url)
      loginUrl.searchParams.set("next", `${pathname}${search}`)
      return NextResponse.redirect(loginUrl)
    }
    return NextResponse.next()
  }

  if (pathname.startsWith("/client")) {
    if (!isPublicClientPath(pathname) && !dbUserSession) {
      const loginUrl = new URL("/client/login", request.url)
      loginUrl.searchParams.set("next", `${pathname}${search}`)
      return NextResponse.redirect(loginUrl)
    }
    return NextResponse.next()
  }

  if (pathname === "/api/agents" || pathname.startsWith("/api/agents/")) {
    if (isPublicAgentApiPath(pathname)) {
      return NextResponse.next()
    }
    if (!adminSession) {
      return unauthorizedApiResponse()
    }
    return NextResponse.next()
  }

  if (pathname === "/api/db-users" || pathname.startsWith("/api/db-users/")) {
    if (isPublicDbUserApiPath(pathname)) {
      return NextResponse.next()
    }
    if (!adminSession) {
      return unauthorizedApiResponse()
    }
    return NextResponse.next()
  }

  if (isAgentReadableApiPath(pathname, request.method)) {
    if (adminSession || dbUserSession) {
      return NextResponse.next()
    }
    return unauthorizedApiResponse()
  }

  if (!adminSession) {
    return unauthorizedApiResponse()
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/login",
    "/client/:path*",
    "/api/account",
    "/api/session",
    "/api/agents",
    "/api/agents/:path*",
    "/api/superadmins/:path*",
    "/api/db-users/:path*",
    "/api/control-schema/:path*",
    "/api/projects",
    "/api/schemas/:path*",
    "/api/vm",
    "/api/vm-ssh/:path*",
    "/api/debug/tables",
  ],
}
