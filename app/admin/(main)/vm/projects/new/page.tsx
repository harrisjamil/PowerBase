"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { ArrowLeft, FolderKanban } from "lucide-react"
import {
  ProjectSetupForm,
  type ProjectFormData,
  type ProjectSuperadmin,
} from "@/components/projects/project-setup-form"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

type SuperadminsResponse = {
  success: boolean
  users?: Array<{
    id: number
    email: string
  }>
  error?: string
}

export default function NewProjectPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [superadmins, setSuperadmins] = useState<ProjectSuperadmin[]>([])
  const [loadingSuperadmins, setLoadingSuperadmins] = useState(true)

  useEffect(() => {
    let cancelled = false

    const loadSuperadmins = async () => {
      try {
        const response = await fetch("/api/superadmins")
        const result = (await response.json()) as SuperadminsResponse

        if (!response.ok || !result.success) {
          throw new Error(result.error || "Failed to load superadmins")
        }

        if (!cancelled) {
          setSuperadmins(
            (result.users ?? []).map((user) => ({
              id: String(user.id),
              email: user.email,
            }))
          )
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Failed to load superadmins")
        }
      } finally {
        if (!cancelled) {
          setLoadingSuperadmins(false)
        }
      }
    }

    void loadSuperadmins()

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
          owner_superadmin_id: data.ownerSuperadminId,
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
            Create a real schema-backed project and assign one superadmin owner.
          </p>
        </div>
      </div>

      {loadingSuperadmins ? (
        <div className="text-sm text-muted-foreground">Loading superadmins...</div>
      ) : (
        <ProjectSetupForm
          onSubmit={handleCreateProject}
          onCancel={() => router.push("/admin/vm/projects")}
          superadmins={superadmins}
          isSubmitting={saving}
        />
      )}
    </div>
  )
}
