"use client"

import { usePathname } from "next/navigation"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

function getHeaderTitle(pathname: string) {
  if (pathname === "/client" || pathname === "/client/dashboard") {
    return "Projects"
  }

  const projectMatch = pathname.match(/^\/client\/projects\/[^/]+(?:\/([^/]+))?/)
  if (!projectMatch) {
    return "Client"
  }

  const section = projectMatch[1]
  switch (section) {
    case "overview":
      return "Project overview"
    case "table-editor":
      return "Table editor"
    case "sql-editor":
      return "SQL editor"
    case "database":
      return "Database"
    case "authentication":
      return "Authentication"
    case "storage":
      return "Storage"
    case "settings":
      return "Project settings"
    default:
      return "Project"
  }
}

export function ClientSiteHeader() {
  const pathname = usePathname()
  const title = getHeaderTitle(pathname)

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">{title}</h1>
      </div>
    </header>
  )
}
