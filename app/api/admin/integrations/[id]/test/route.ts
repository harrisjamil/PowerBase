import { NextRequest, NextResponse } from "next/server"
import { requireAdminRequest } from "@/lib/auth/session"
import { getPool } from "@/lib/db"
import { getPlatformIntegrationById, testPlatformWebhook } from "@/lib/platform-integrations"

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  const { id } = await context.params
  const client = await getPool().connect()
  try {
    const integration = await getPlatformIntegrationById(client, id)
    if (!integration) {
      return NextResponse.json({ success: false, error: "Integration not found" }, { status: 404 })
    }

    const result = await testPlatformWebhook(client, id)
    if (!result.ok) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || "Webhook test failed",
          statusCode: result.statusCode,
        },
        { status: 400 }
      )
    }

    const updated = await getPlatformIntegrationById(client, id)
    return NextResponse.json({
      success: true,
      statusCode: result.statusCode,
      integration: updated,
    })
  } catch (error) {
    console.error("Webhook test error:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Webhook test failed") },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
