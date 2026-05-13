import { redirect } from "next/navigation"
import { getAdminSession } from "@/lib/auth/session"

export default async function HomePage() {
  const session = await getAdminSession()
  redirect(session ? "/admin/dashboard" : "/admin/login")
}