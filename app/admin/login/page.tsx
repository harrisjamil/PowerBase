import { redirect } from "next/navigation"
import { LoginForm } from "@/components/login-form"
import { getAdminSession } from "@/lib/auth/session"

const Login = async () => {
  const session = await getAdminSession()
  if (session) {
    redirect("/admin/dashboard")
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm
          title="Admin Login"
          description="Enter your PostgreSQL admin username and password."
          identifierLabel="Username"
          identifierPlaceholder="Enter your PostgreSQL username"
          identifierKey="username"
        />
      </div>
    </div>
  )
}

export default Login