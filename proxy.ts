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

function isPublicAuthApiPath(pathname: string) {
  return (
    pathname === "/api/login" ||
    pathname === "/api/login/totp" ||
    pathname === "/api/logout"
  )
}

function isPublicRestApiPath(pathname: string) {
  return /\/api\/projects\/[^/]+\/rest\/v1\//.test(pathname)
}

function isAdminOnlyApiPath(pathname: string) {
  if (isPublicAuthApiPath(pathname) || isPublicAgentApiPath(pathname) || isPublicDbUserApiPath(pathname)) {
    return false
  }

  return (
    pathname === "/api/vm" ||
    pathname.startsWith("/api/vm-ssh/") ||
    pathname.startsWith("/api/admin/") ||
    pathname === "/api/db-users" ||
    (pathname.startsWith("/api/db-users/") && !isPublicDbUserApiPath(pathname)) ||
    (pathname.startsWith("/api/agents") && !isPublicAgentApiPath(pathname)) ||
    pathname.startsWith("/api/superadmins") ||
    pathname.startsWith("/api/control-schema") ||
    pathname.startsWith("/api/data-library") ||
    pathname.startsWith("/api/team") ||
    pathname.startsWith("/api/debug/") ||
    pathname === "/api/account" ||
    pathname === "/api/session"
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

  if (pathname.startsWith("/api/")) {
    if (
      isPublicAuthApiPath(pathname) ||
      isPublicAgentApiPath(pathname) ||
      isPublicDbUserApiPath(pathname) ||
      isPublicRestApiPath(pathname)
    ) {
      return NextResponse.next()
    }

    if (isAdminOnlyApiPath(pathname)) {
      if (!adminSession) {
        return unauthorizedApiResponse()
      }
      return NextResponse.next()
    }

    // Project/schema and other principal-authenticated routes enforce auth in handlers.
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/login",
    "/client/:path*",
    "/api/:path*",
  ],
}
