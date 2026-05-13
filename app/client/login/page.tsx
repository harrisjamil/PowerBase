import { redirect } from "next/navigation"
import { LoginForm } from "@/components/login-form"
import { getAgentSession } from "@/lib/auth/agent-session"

export default async function ClientLoginPage() {
  const session = await getAgentSession()
  if (session) {
    redirect("/client")
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm
          title="Agent login"
          description="Enter your agent email and password to access the client area."
          loginPath="/api/agents/login"
          successRedirect="/client"
        />
      </div>
    </div>
  )
}
