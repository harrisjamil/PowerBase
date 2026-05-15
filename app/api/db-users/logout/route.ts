import { NextResponse } from "next/server"
import { clearDbUserSessionCookie } from "@/lib/auth/db-user-session"

export async function POST() {
  return clearDbUserSessionCookie(
    NextResponse.json({
      success: true,
      message: "Logged out successfully",
    })
  )
}
