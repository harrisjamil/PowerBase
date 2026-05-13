import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { getAdminSession } from "@/lib/auth/session"
import { redirect } from "next/navigation"
import type { CSSProperties, ReactNode } from "react"

function getDisplayName(email: string) {
  const [name] = email.split("@")
  return name || email
}

export default async function AdminMainLayout({
  children,
}: {
  children: ReactNode
}) {
  const session = await getAdminSession()
  if (!session) {
    redirect("/admin/login")
  }

  return (
    <TooltipProvider>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 72)",
            "--header-height": "calc(var(--spacing) * 12)",
          } as CSSProperties
        }
      >
        <AppSidebar
          variant="inset"
          currentUser={{
            name: getDisplayName(session.email),
            email: session.email,
          }}
        />
        <SidebarInset>
          <SiteHeader />
          <div className="flex flex-1 flex-col">
            <div className="@container/main flex flex-1 flex-col gap-2">
              {children}
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
