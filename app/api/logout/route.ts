import { NextResponse } from "next/server"
import { clearAdminSessionCookie } from "@/lib/auth/session"

export async function POST() {
  return clearAdminSessionCookie(
    NextResponse.json({
      success: true,
      message: "Logged out successfully",
    })
  )
}
