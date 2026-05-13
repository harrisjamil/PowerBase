import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { getAdminSessionFromRequest } from "@/lib/auth/session"

function isLoginPath(pathname: string) {
  return pathname === "/admin/login" || pathname === "/login"
}

function isPublicAdminPath(pathname: string) {
  return isLoginPath(pathname) || pathname === "/admin/register"
}

function unauthorizedApiResponse() {
  return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const session = getAdminSessionFromRequest(request)

  if (isLoginPath(pathname)) {
    if (session) {
      return NextResponse.redirect(new URL("/admin/dashboard", request.url))
    }
    return NextResponse.next()
  }

  if (pathname.startsWith("/admin")) {
    if (!isPublicAdminPath(pathname) && !session) {
      const loginUrl = new URL("/admin/login", request.url)
      loginUrl.searchParams.set("next", `${pathname}${search}`)
      return NextResponse.redirect(loginUrl)
    }
    return NextResponse.next()
  }

  if (!session) {
    return unauthorizedApiResponse()
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/login",
    "/api/account",
    "/api/session",
    "/api/superadmins/:path*",
    "/api/db-users/:path*",
    "/api/control-schema/:path*",
    "/api/schemas/:path*",
    "/api/vm",
    "/api/vm-ssh/:path*",
    "/api/debug/tables",
  ],
}
