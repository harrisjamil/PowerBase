import { NextRequest, NextResponse } from "next/server"
import { requireAdminRequest } from "@/lib/auth/session"
import { getAdminTotpStatus } from "@/lib/admin-totp"
import { getPool } from "@/lib/db"
import {
  getPlatformSecuritySettings,
  readPositiveInt,
  updatePlatformSecuritySettings,
} from "@/lib/platform-settings"

export async function GET(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  const client = await getPool().connect()
  try {
    const [settings, totpStatus] = await Promise.all([
      getPlatformSecuritySettings(client),
      getAdminTotpStatus(client, auth.session.id),
    ])

    return NextResponse.json({
      success: true,
      settings,
      totp: totpStatus,
    })
  } catch (error) {
    console.error("Error loading security settings:", error)
    return NextResponse.json(
      { success: false, error: "Failed to load security settings" },
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
    const current = await getPlatformSecuritySettings(client)
    const totpStatus = await getAdminTotpStatus(client, auth.session.id)

    const nextTwoFactorRequired =
      body.twoFactorRequired === undefined
        ? current.twoFactorRequired
        : Boolean(body.twoFactorRequired)

    if (nextTwoFactorRequired && !totpStatus.enrolled) {
      return NextResponse.json(
        {
          success: false,
          error: "Set up Google Authenticator before requiring 2FA for all admins.",
          needsTotpEnrollment: true,
        },
        { status: 400 }
      )
    }

    const settings = await updatePlatformSecuritySettings(client, {
      twoFactorRequired: nextTwoFactorRequired,
      sessionTimeoutMinutes:
        body.sessionTimeoutMinutes === undefined
          ? undefined
          : readPositiveInt(body.sessionTimeoutMinutes, current.sessionTimeoutMinutes),
      maxLoginAttempts:
        body.maxLoginAttempts === undefined
          ? undefined
          : readPositiveInt(body.maxLoginAttempts, current.maxLoginAttempts),
      passwordExpiryDays:
        body.passwordExpiryDays === undefined
          ? undefined
          : readPositiveInt(body.passwordExpiryDays, current.passwordExpiryDays),
    })

    return NextResponse.json({
      success: true,
      settings,
      totp: totpStatus,
    })
  } catch (error) {
    console.error("Error saving security settings:", error)
    return NextResponse.json(
      { success: false, error: "Failed to save security settings" },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
