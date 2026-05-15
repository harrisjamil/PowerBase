import { redirect } from "next/navigation"

export default function AgentsPage() {
  redirect("/admin/admin?tab=agents")
}