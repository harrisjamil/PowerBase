import { NextRequest, NextResponse } from "next/server"
import { requireAdminRequest } from "@/lib/auth/session"
import { getPool } from "@/lib/db"
import { INTEGRATION_CATALOG } from "@/lib/integration-catalog"
import {
  createPlatformIntegration,
  listPlatformIntegrations,
  parseCreateIntegrationBody,
} from "@/lib/platform-integrations"

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export async function GET(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  const client = await getPool().connect()
  try {
    const integrations = await listPlatformIntegrations(client)
    return NextResponse.json({
      success: true,
      integrations,
      catalog: INTEGRATION_CATALOG,
    })
  } catch (error) {
    console.error("List integrations error:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to load integrations") },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const input = parseCreateIntegrationBody(body)
  if (!input) {
    return NextResponse.json(
      { success: false, error: "Invalid integration payload" },
      { status: 400 }
    )
  }

  const client = await getPool().connect()
  try {
    const integration = await createPlatformIntegration(client, input)
    return NextResponse.json({ success: true, integration })
  } catch (error) {
    console.error("Create integration error:", error)
    const message = errorMessage(error, "Failed to create integration")
    const status = message.includes("already connected") ? 409 : 400
    return NextResponse.json({ success: false, error: message }, { status })
  } finally {
    client.release()
  }
}
