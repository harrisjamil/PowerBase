import { NextResponse } from "next/server"
import { clearAgentSessionCookie } from "@/lib/auth/agent-session"

export async function POST() {
  return clearAgentSessionCookie(
    NextResponse.json({
      success: true,
      message: "Logged out successfully",
    })
  )
}
