import { redirect } from "next/navigation"
import { AgentLogoutButton } from "@/components/client/agent-logout-button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getAgentSession } from "@/lib/auth/agent-session"

export default async function ClientHomePage() {
  const session = await getAgentSession()
  if (!session) {
    redirect("/client/login")
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-xl">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Client Area</CardTitle>
            <CardDescription>
              Logged in with the dedicated agent session, separate from admin access.
            </CardDescription>
          </div>
          <AgentLogoutButton />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Email</div>
              <div className="font-medium">{session.email}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Control Schema</div>
              <div className="font-mono text-sm">{session.controlSchema}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
