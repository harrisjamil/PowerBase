import { dbUserSessionPublicUser, getDbUserSession } from "@/lib/auth/db-user-session"

export async function GET() {
  const session = await getDbUserSession()
  if (!session) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  return Response.json({
    success: true,
    user: dbUserSessionPublicUser(session),
  })
}
