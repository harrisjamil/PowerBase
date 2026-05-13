import { agentSessionPublicUser, getAgentSession } from "@/lib/auth/agent-session"

export async function GET() {
  const session = await getAgentSession()
  if (!session) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  return Response.json({
    success: true,
    user: agentSessionPublicUser(session),
  })
}
