"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ArrowLeft, FolderKanban } from "lucide-react"
import { ProjectSetupForm, type ProjectFormData } from "@/components/projects/project-setup-form"
import { Button } from "@/components/ui/button"
import { createVmProject, loadVmProjects, saveVmProjects } from "@/lib/vm-projects"
import { toast } from "sonner"

export default function NewProjectPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  const createProjectSchema = async (projectName: string, description: string) => {
    const schemaName = projectName.trim()

    const response = await fetch("/api/schemas", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        schema_name: schemaName,
        description: description.trim() || `Project schema for ${schemaName}`,
      }),
    })

    const result = await response.json()

    if (!response.ok || !result.success) {
      throw new Error(result.error || `Failed to create schema "${schemaName}"`)
    }

    return schemaName
  }

  const handleCreateProject = async (data: ProjectFormData) => {
    setSaving(true)

    try {
      const schemaName = await createProjectSchema(data.name, data.description)
      const projects = loadVmProjects()
      const newProject = createVmProject({
        name: data.name,
        description: data.description,
        region: data.region,
        postgresType: data.postgresType,
      })

      saveVmProjects([newProject, ...projects])
      toast.success(`Project "${data.name}" created with schema "${schemaName}"`)
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
            Set up a new project on its own page instead of inside a modal.
          </p>
        </div>
      </div>

      <ProjectSetupForm
        onSubmit={handleCreateProject}
        onCancel={() => router.push("/admin/vm/projects")}
        organizations={[{ id: "1", name: "Haris Mian's Org", plan: "Free" }]}
        isSubmitting={saving}
      />
    </div>
  )
}
