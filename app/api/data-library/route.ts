import { NextRequest, NextResponse } from "next/server"
import { requireAdminRequest } from "@/lib/auth/session"
import { requirePrincipalRequest } from "@/lib/auth/principal-session"
import { getPool } from "@/lib/db"
import {
  buildDataLibraryCatalog,
  createStoredAsset,
  createStoredFolder,
  deleteStoredAsset,
  incrementAssetViews,
  isDerivedAssetId,
  parseStoredAssetId,
  readCreateAssetBody,
  readCreateFolderBody,
} from "@/lib/data-library"

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export async function GET(request: NextRequest) {
  const auth = requirePrincipalRequest(request)
  if (!auth.ok) return auth.response

  const client = await getPool().connect()
  try {
    const catalog = await buildDataLibraryCatalog(client, auth.session)
    return NextResponse.json({
      success: true,
      assets: catalog.assets,
      folders: catalog.folders,
      count: catalog.assets.length,
    })
  } catch (error) {
    console.error("Data library catalog error:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to load data library") },
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
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    )
  }

  const kind = typeof body.kind === "string" ? body.kind : "asset"

  const client = await getPool().connect()
  try {
    if (kind === "folder") {
      const input = readCreateFolderBody(body)
      if (!input) {
        return NextResponse.json(
          { success: false, error: "Folder name is required" },
          { status: 400 }
        )
      }

      const folder = await createStoredFolder(client, input)
      return NextResponse.json({ success: true, folder })
    }

    const input = readCreateAssetBody(body)
    if (!input) {
      return NextResponse.json(
        { success: false, error: "Valid asset name and type are required" },
        { status: 400 }
      )
    }

    const asset = await createStoredAsset(client, input)
    return NextResponse.json({ success: true, asset })
  } catch (error) {
    console.error("Data library create error:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to create library entry") },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}

export async function DELETE(request: NextRequest) {
  const auth = requireAdminRequest(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")?.trim() ?? ""

  if (!id) {
    return NextResponse.json(
      { success: false, error: "Asset id is required" },
      { status: 400 }
    )
  }

  if (isDerivedAssetId(id)) {
    return NextResponse.json(
      {
        success: false,
        error: "System and schema assets cannot be deleted. Remove the schema or project instead.",
      },
      { status: 400 }
    )
  }

  const storedId = parseStoredAssetId(id)
  if (!storedId) {
    return NextResponse.json(
      { success: false, error: "Invalid asset id" },
      { status: 400 }
    )
  }

  const client = await getPool().connect()
  try {
    const deleted = await deleteStoredAsset(client, storedId)
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: "Asset not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Data library delete error:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to delete asset") },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}

export async function PATCH(request: NextRequest) {
  const auth = requirePrincipalRequest(request)
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    )
  }

  if (body.action !== "view") {
    return NextResponse.json(
      { success: false, error: "Unsupported action" },
      { status: 400 }
    )
  }

  const id = typeof body.id === "string" ? body.id : ""
  const storedId = parseStoredAssetId(id)
  if (!storedId) {
    return NextResponse.json({ success: true })
  }

  const client = await getPool().connect()
  try {
    await incrementAssetViews(client, storedId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Data library view increment error:", error)
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Failed to update views") },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
