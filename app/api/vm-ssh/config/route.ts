import { NextResponse } from "next/server"
import { getAdminSessionFromRequest, unauthorizedJson } from "@/lib/auth/session"
import { getSshUiDefaults } from "@/lib/vm-ssh-config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Form defaults from env (no secrets). `envAuthReady` means POST /session without body can connect. */
export async function GET(request: Request) {
  if (!getAdminSessionFromRequest(request)) {
    return unauthorizedJson()
  }

  const { defaults, envAuthReady } = getSshUiDefaults()
  return NextResponse.json({ ok: true, defaults, envAuthReady })
}
