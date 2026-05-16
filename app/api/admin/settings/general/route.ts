import { NextRequest, NextResponse } from "next/server"
import { requireAdminRequest } from "@/lib/auth/session"
import { getPool } from "@/lib/db"
import {
  getPlatformGeneralSettings,
  readDateFormat,
  readPlatformName,
  readPlatformUrl,
  readSupportEmail,
  readTimezone,
  updatePlatformGeneralSettings,
} from "@/lib/platform-settings"

export async function GET(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  const client = await getPool().connect()
  try {
    const settings = await getPlatformGeneralSettings(client)
    return NextResponse.json({ success: true, settings })
  } catch (error) {
    console.error("Error loading general settings:", error)
    return NextResponse.json(
      { success: false, error: "Failed to load general settings" },
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
    const current = await getPlatformGeneralSettings(client)

    const platformName =
      body.platformName === undefined ? undefined : readPlatformName(body.platformName)
    if (body.platformName !== undefined && !platformName) {
      return NextResponse.json(
        { success: false, error: "Platform name is required" },
        { status: 400 }
      )
    }

    const platformUrl =
      body.platformUrl === undefined ? undefined : readPlatformUrl(body.platformUrl)
    if (body.platformUrl !== undefined && platformUrl === null) {
      return NextResponse.json(
        { success: false, error: "Platform URL must be a valid http or https URL" },
        { status: 400 }
      )
    }

    const supportEmail =
      body.supportEmail === undefined ? undefined : readSupportEmail(body.supportEmail)
    if (body.supportEmail !== undefined && supportEmail === null) {
      return NextResponse.json(
        { success: false, error: "Support email is invalid" },
        { status: 400 }
      )
    }

    const timezone =
      body.timezone === undefined ? undefined : readTimezone(body.timezone)
    const dateFormat =
      body.dateFormat === undefined ? undefined : readDateFormat(body.dateFormat)

    const settings = await updatePlatformGeneralSettings(client, {
      platformName: platformName ?? current.platformName,
      platformUrl: platformUrl ?? current.platformUrl,
      supportEmail: supportEmail ?? current.supportEmail,
      timezone: timezone ?? current.timezone,
      dateFormat: dateFormat ?? current.dateFormat,
    })

    return NextResponse.json({ success: true, settings })
  } catch (error) {
    console.error("Error saving general settings:", error)
    const message =
      error instanceof Error && error.message ? error.message : "Failed to save general settings"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  } finally {
    client.release()
  }
}
