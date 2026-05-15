import { ClientShell } from "@/components/client-shell"
import { TooltipProvider } from "@/components/ui/tooltip"
import { getDbUserSession } from "@/lib/auth/db-user-session"
import { redirect } from "next/navigation"
import type { ReactNode } from "react"

export default async function ClientMainLayout({
  children,
}: {
  children: ReactNode
}) {
  const session = await getDbUserSession()
  if (!session) {
    redirect("/client/login")
  }

  return (
    <TooltipProvider>
      <ClientShell
        currentUser={{
          name: session.username,
          email: session.username,
        }}
      >
        {children}
      </ClientShell>
    </TooltipProvider>
  )
}
