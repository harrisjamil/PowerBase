import { NextRequest, NextResponse } from "next/server"
import { requireAdminRequest } from "@/lib/auth/session"
import { getPool } from "@/lib/db"
import {
  CONTROL_TABLE_NAME,
  DEFAULT_CONTROL_SCHEMA,
  getControlSchema,
  isSafePgIdentifier,
} from "@/lib/control-schema"
import { patchVmLocalSettings } from "@/lib/vm-local-settings"

export async function GET(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  return NextResponse.json({
    success: true,
    controlSchema: getControlSchema(),
    defaultControlSchema: DEFAULT_CONTROL_SCHEMA,
    table: CONTROL_TABLE_NAME,
  })
}

export async function POST(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    )
  }

  const schemaName =
    body && typeof body === "object" && typeof (body as { schemaName?: unknown }).schemaName === "string"
      ? (body as { schemaName: string }).schemaName.trim()
      : ""

  if (!schemaName || !isSafePgIdentifier(schemaName)) {
    return NextResponse.json(
      { success: false, error: "Enter a valid schema name." },
      { status: 400 }
    )
  }

  const client = await getPool().connect()
  try {
    const schemaResult = await client.query<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM pg_catalog.pg_namespace
          WHERE nspname = $1
        ) AS exists
      `,
      [schemaName]
    )

    if (!schemaResult.rows[0]?.exists) {
      return NextResponse.json(
        { success: false, error: `Schema "${schemaName}" does not exist.` },
        { status: 400 }
      )
    }

    const tableResult = await client.query<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = $1
            AND table_name = $2
        ) AS exists
      `,
      [schemaName, CONTROL_TABLE_NAME]
    )

    if (!tableResult.rows[0]?.exists) {
      return NextResponse.json(
        {
          success: false,
          error: `Schema "${schemaName}" must contain a "${CONTROL_TABLE_NAME}" table for credentials/logins.`,
        },
        { status: 400 }
      )
    }

    patchVmLocalSettings({
      controlSchema: schemaName === DEFAULT_CONTROL_SCHEMA ? null : schemaName,
    })

    return NextResponse.json({
      success: true,
      controlSchema: schemaName,
      table: CONTROL_TABLE_NAME,
      message: `Control schema set to ${schemaName}.`,
    })
  } catch (error) {
    console.error("Error saving control schema:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to save control schema" },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
