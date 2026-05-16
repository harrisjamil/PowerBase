import { NextRequest, NextResponse } from "next/server"
import {
  deletePlatformIntegration,
  getPlatformIntegrationById,
  updatePlatformIntegration,
  type IntegrationStatus,
  type UpdateIntegrationInput,
} from "@/lib/platform-integrations"
import { requireAdminRequest } from "@/lib/auth/session"
import { getPool } from "@/lib/db"

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function readStatus(value: unknown): IntegrationStatus | undefined {
  return value === "connected" || value === "disconnected" || value === "error"
    ? value
    : undefined
}

export async function GET(
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
    return NextResponse.json({ success: true, integration })
  } catch (error) {
    console.error("Get integration error:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to load integration") },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  const { id } = await context.params
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const input: UpdateIntegrationInput = {
    name: typeof body.name === "string" ? body.name : undefined,
    status: readStatus(body.status),
    description: typeof body.description === "string" ? body.description : undefined,
    webhookUrl: typeof body.webhookUrl === "string" ? body.webhookUrl : undefined,
    events: Array.isArray(body.events) ? body.events : undefined,
    apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
    apiSecret: typeof body.apiSecret === "string" ? body.apiSecret : undefined,
    webhookSecret: typeof body.webhookSecret === "string" ? body.webhookSecret : undefined,
    clientId: typeof body.clientId === "string" ? body.clientId : undefined,
    errorMessage:
      body.errorMessage === null
        ? null
        : typeof body.errorMessage === "string"
          ? body.errorMessage
          : undefined,
  }

  const client = await getPool().connect()
  try {
    const integration = await updatePlatformIntegration(client, id, input)
    if (!integration) {
      return NextResponse.json({ success: false, error: "Integration not found" }, { status: 404 })
    }
    return NextResponse.json({ success: true, integration })
  } catch (error) {
    console.error("Update integration error:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to update integration") },
      { status: 400 }
    )
  } finally {
    client.release()
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  const { id } = await context.params
  const client = await getPool().connect()
  try {
    const deleted = await deletePlatformIntegration(client, id)
    if (!deleted) {
      return NextResponse.json({ success: false, error: "Integration not found" }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete integration error:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to delete integration") },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
