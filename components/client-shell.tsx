"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { ClientAppSidebar } from "@/components/client-app-sidebar"
import { ClientSiteHeader } from "@/components/client-site-header"
import { usePeriodicCallback } from "@/hooks/use-periodic-callback"
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

const PROJECT_ACCESS_POLL_MS = 5_000

export function ClientShell({
  currentUser,
  children,
}: {
  currentUser: { name: string; email: string }
  children: React.ReactNode
}) {
  const router = useRouter()
  const params = useParams()
  const projectId = typeof params?.id === "string" ? params.id : null
  const [project, setProject] = useState<ProjectSummary | null>(null)
  const hadProjectAccessRef = useRef(false)

  const syncProjectAccess = useCallback(async () => {
    if (!projectId) {
      hadProjectAccessRef.current = false
      setProject(null)
      return
    }

    try {
      const response = await fetch(`/api/projects/${projectId}?lite=1`, {
        cache: "no-store",
      })
      const data = (await response.json()) as {
        success: boolean
        project?: ProjectSummary
      }

      if (response.ok && data.success && data.project) {
        hadProjectAccessRef.current = true
        setProject({
          name: data.project.name,
          schema_name: data.project.schema_name,
          status: data.project.status,
        })
        return
      }

      if (hadProjectAccessRef.current) {
        toast.info("You no longer have access to this project")
        router.replace("/client/dashboard")
      } else if (!response.ok || !data.success) {
        router.replace("/client/dashboard")
      }

      hadProjectAccessRef.current = false
      setProject(null)
    } catch {
      // Keep the current view on transient network errors.
    }
  }, [projectId, router])

  useEffect(() => {
    hadProjectAccessRef.current = false
    void syncProjectAccess()
  }, [syncProjectAccess])

  usePeriodicCallback(() => {
    void syncProjectAccess()
  }, PROJECT_ACCESS_POLL_MS, Boolean(projectId))

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
