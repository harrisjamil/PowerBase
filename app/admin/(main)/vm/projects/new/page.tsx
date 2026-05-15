"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { ArrowLeft, FolderKanban } from "lucide-react"
import {
  ProjectSetupForm,
  type ProjectFormData,
  type ProjectPgUser,
} from "@/components/projects/project-setup-form"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

type DbUsersResponse = {
  success: boolean
  users?: Array<{
    oid: number
    username: string
    can_login: boolean
    is_system_role: boolean
  }>
  error?: string
}

type AccountResponse = {
  success: boolean
  user?: {
    email: string
  }
  error?: string
}

export default function NewProjectPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [pgUsers, setPgUsers] = useState<ProjectPgUser[]>([])
  const [creatorRoleName, setCreatorRoleName] = useState<string | null>(null)
  const [loadingContext, setLoadingContext] = useState(true)

  useEffect(() => {
    let cancelled = false

    const loadContext = async () => {
      try {
        const [usersResponse, accountResponse] = await Promise.all([
          fetch("/api/db-users"),
          fetch("/api/account"),
        ])
        const usersResult = (await usersResponse.json()) as DbUsersResponse
        const accountResult = (await accountResponse.json()) as AccountResponse

        if (!usersResponse.ok || !usersResult.success) {
          throw new Error(usersResult.error || "Failed to load PostgreSQL users")
        }
        if (!accountResponse.ok || !accountResult.success) {
          throw new Error(accountResult.error || "Failed to load current admin")
        }

        if (!cancelled) {
          setPgUsers(
            (usersResult.users ?? []).map((user) => ({
              oid: user.oid,
              username: user.username,
              canLogin: user.can_login,
              isSystemRole: user.is_system_role,
            }))
          )
          setCreatorRoleName(accountResult.user?.email ?? null)
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Failed to load project setup data")
        }
      } finally {
        if (!cancelled) {
          setLoadingContext(false)
        }
      }
    }

    void loadContext()

    return () => {
      cancelled = true
    }
  }, [])

  const handleCreateProject = async (data: ProjectFormData) => {
    setSaving(true)

    try {
      const response = await fetch("/api/schemas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          project_name: data.name,
          schema_name: data.schemaName,
          description: `Project schema for ${data.name}`,
          assigned_role_names: data.assignedRoleNames,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to create project")
      }

      toast.success(`Project "${data.name}" created with schema "${data.schemaName}"`)
      router.push("/admin/vm/projects")
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create project"
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-4 md:px-6 md:py-6">
      <div className="flex flex-col gap-3">
        <Button asChild variant="ghost" className="w-fit gap-2 px-0 hover:bg-transparent">
          <Link href="/admin/vm/projects">
            <ArrowLeft className="h-4 w-4" />
            Back to projects
          </Link>
        </Button>

        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <FolderKanban className="h-5 w-5" />
            Create Project
          </h1>
          <p className="text-sm text-muted-foreground">
            Create a real schema-backed project and assign multiple PostgreSQL users while keeping the creator assigned.
          </p>
        </div>
      </div>

      {loadingContext ? (
        <div className="text-sm text-muted-foreground">Loading project setup...</div>
      ) : (
        <ProjectSetupForm
          onSubmit={handleCreateProject}
          onCancel={() => router.push("/admin/vm/projects")}
          pgUsers={pgUsers}
          creatorRoleName={creatorRoleName}
          isSubmitting={saving}
        />
      )}
    </div>
  )
}
