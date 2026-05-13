import { adminSessionPublicUser, getAdminSession, unauthorizedJson } from "@/lib/auth/session"

export async function GET() {
  const session = await getAdminSession()
  if (!session) {
    return unauthorizedJson()
  }

  return Response.json({
    success: true,
    user: adminSessionPublicUser(session),
  })
}
