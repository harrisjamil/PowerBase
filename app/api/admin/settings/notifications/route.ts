import { NextRequest, NextResponse } from "next/server"
import { requireAdminRequest } from "@/lib/auth/session"
import { getPool } from "@/lib/db"
import {
  getPlatformNotificationSettings,
  readBoolean,
  updatePlatformNotificationSettings,
} from "@/lib/platform-settings"

export async function GET(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  const client = await getPool().connect()
  try {
    const settings = await getPlatformNotificationSettings(client)
    return NextResponse.json({ success: true, settings })
  } catch (error) {
    console.error("Error loading notification settings:", error)
    return NextResponse.json(
      { success: false, error: "Failed to load notification settings" },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}

export async function PATCH(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const client = await getPool().connect()
  try {
    const current = await getPlatformNotificationSettings(client)

    const settings = await updatePlatformNotificationSettings(client, {
      emailNotifications: readBoolean(
        body.emailNotifications,
        current.emailNotifications
      ),
      newUserAlert: readBoolean(body.newUserAlert, current.newUserAlert),
      securityAlerts: readBoolean(body.securityAlerts, current.securityAlerts),
      systemUpdates: readBoolean(body.systemUpdates, current.systemUpdates),
    })

    return NextResponse.json({ success: true, settings })
  } catch (error) {
    console.error("Error saving notification settings:", error)
    return NextResponse.json(
      { success: false, error: "Failed to save notification settings" },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
