import { redirect } from "next/navigation"
import { LoginForm } from "@/components/login-form"
import { getDbUserSession } from "@/lib/auth/db-user-session"

export default async function ClientLoginPage() {
  const session = await getDbUserSession()
  if (session) {
    redirect("/client/dashboard")
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm
          title="DB User Login"
          description="Enter your PostgreSQL username and password to access the client area."
          identifierLabel="Username"
          identifierPlaceholder="Enter your PostgreSQL username"
          identifierKey="username"
          loginPath="/api/db-users/login"
          successRedirect="/client/dashboard"
        />
      </div>
    </div>
  )
}
