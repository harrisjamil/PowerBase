"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  FolderKanban,
  Plus,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  Database,
  UserRound,
  Layers3,
  Trash2,
} from "lucide-react"
import { DeleteConfirmationDialog } from "@/components/agents/delete-confirmation-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table as UITable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

type Project = {
  id: number
  name: string
  schema_name: string
  owner: string
  table_count: number
  total_size: string
  description: string | null
  owner_superadmin_id: number | null
  owner_superadmin_email: string | null
  status: string
  created_at: string | null
  updated_at: string | null
}

type ProjectsResponse = {
  success: boolean
  projects?: Project[]
  error?: string
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/projects")
      const result = (await response.json()) as ProjectsResponse

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to load projects")
      }

      setProjects(result.projects ?? [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load projects")
    } finally {
      setLoading(false)
    }
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }

  useEffect(() => {
    let cancelled = false

    const loadInitialData = async () => {
      try {
        const response = await fetch("/api/projects")
        const result = (await response.json()) as ProjectsResponse

        if (cancelled) {
          return
        }

        if (!response.ok || !result.success) {
          throw new Error(result.error || "Failed to load projects")
        }

        setProjects(result.projects ?? [])
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Failed to load projects")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadInitialData()

    return () => {
      cancelled = true
    }
  }, [])

  const openDelete = (project: Project) => {
    setSelectedProject(project)
    setDeleteOpen(true)
  }

  const handleDelete = async () => {
    if (!selectedProject) return

    setDeleting(true)
    try {
      const response = await fetch(`/api/projects?id=${encodeURIComponent(String(selectedProject.id))}`, {
        method: "DELETE",
      })
      const result = (await response.json()) as { success?: boolean; error?: string }

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to delete project")
      }

      toast.success(`Project "${selectedProject.name}" deleted. Schema "${selectedProject.schema_name}" was kept.`)
      setDeleteOpen(false)
      setSelectedProject(null)
      await loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete project")
    } finally {
      setDeleting(false)
    }
  }

  const stats = useMemo(
    () => ({
      total: projects.length,
      assigned: projects.filter((project) => Boolean(project.owner_superadmin_id)).length,
      unassigned: projects.filter((project) => !project.owner_superadmin_id).length,
      totalTables: projects.reduce((sum, project) => sum + Number(project.table_count || 0), 0),
    }),
    [projects]
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-sm text-muted-foreground">Loading projects...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-4 md:px-6 md:py-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <FolderKanban className="h-5 w-5" />
            Projects
          </h1>
          <p className="text-sm text-muted-foreground">
            Real projects backed by your live Postgres schemas.
          </p>
        </div>

        <div className="flex gap-2">
          <Button asChild className="gap-2">
            <Link href="/admin/vm/projects/new">
              <Plus className="h-4 w-4" />
              New project
            </Link>
          </Button>
          <Button onClick={handleRefresh} variant="outline" className="gap-2" disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Projects</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-2xl font-bold">{stats.total}</span>
            <FolderKanban className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Assigned owners</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-2xl font-bold">{stats.assigned}</span>
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Unassigned</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-2xl font-bold">{stats.unassigned}</span>
            <UserRound className="h-5 w-5 text-amber-600" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tables</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-2xl font-bold">{stats.totalTables}</span>
            <Layers3 className="h-5 w-5 text-sky-600" />
          </CardContent>
        </Card>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <UITable>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Schema</TableHead>
              <TableHead>Owner superadmin</TableHead>
              <TableHead>Tables</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>DB owner</TableHead>
              <TableHead className="w-[110px] text-right">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  No real projects found yet.
                  <Button asChild variant="link" className="ml-2">
                    <Link href="/admin/vm/projects/new">Create one</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ) : (
              projects.map((project) => (
                <TableRow key={project.schema_name}>
                  <TableCell>
                    <div className="flex min-w-[220px] items-start gap-3">
                      <div className="rounded-lg bg-muted p-2">
                        <FolderKanban className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="font-medium">{project.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {project.description || "No description"}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 font-mono text-sm">
                      <Database className="h-4 w-4 text-muted-foreground" />
                      {project.schema_name}
                    </div>
                  </TableCell>
                  <TableCell>
                    {project.owner_superadmin_email ? (
                      <Badge variant="secondary">{project.owner_superadmin_email}</Badge>
                    ) : (
                      <Badge variant="outline">Unassigned</Badge>
                    )}
                  </TableCell>
                  <TableCell>{project.table_count}</TableCell>
                  <TableCell>{project.total_size}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{project.owner}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button asChild variant="ghost" size="sm" className="gap-1">
                        <Link href={`/admin/schemas/${encodeURIComponent(project.schema_name)}`}>
                          <ExternalLink className="h-4 w-4" />
                          Open
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => openDelete(project)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </UITable>
      </div>

      <DeleteConfirmationDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
        title="Delete Project"
        description={
          selectedProject
            ? `This removes only the project record. The schema "${selectedProject.schema_name}" will not be deleted.`
            : "This removes only the project record. The schema will not be deleted."
        }
        itemName={selectedProject?.name}
        confirming={deleting}
      />
    </div>
  )
}