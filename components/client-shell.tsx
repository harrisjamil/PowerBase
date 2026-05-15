"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { ClientAppSidebar } from "@/components/client-app-sidebar"
import { ClientSiteHeader } from "@/components/client-site-header"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import type { CSSProperties } from "react"

type ProjectSummary = {
  name: string
  schema_name: string
  status: string
}

export function ClientShell({
  currentUser,
  children,
}: {
  currentUser: { name: string; email: string }
  children: React.ReactNode
}) {
  const params = useParams()
  const projectId = typeof params?.id === "string" ? params.id : null
  const [project, setProject] = useState<ProjectSummary | null>(null)

  useEffect(() => {
    if (!projectId) {
      setProject(null)
      return
    }

    let cancelled = false

    const loadProject = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}?lite=1`)
        const data = (await response.json()) as {
          success: boolean
          project?: ProjectSummary
        }
        if (!cancelled && response.ok && data.success && data.project) {
          setProject({
            name: data.project.name,
            schema_name: data.project.schema_name,
            status: data.project.status,
          })
        }
      } catch {
        if (!cancelled) {
          setProject(null)
        }
      }
    }

    void loadProject()

    return () => {
      cancelled = true
    }
  }, [projectId])

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as CSSProperties
      }
    >
      <ClientAppSidebar
        variant="inset"
        currentUser={currentUser}
        project={project}
      />
      <SidebarInset>
        <ClientSiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
