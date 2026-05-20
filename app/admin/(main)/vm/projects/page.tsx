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
  Edit2,
  Loader2,
  Search,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"

type Project = {
  id: number
  name: string
  schema_name: string
  owner: string
  table_count: number
  total_size: string
  description: string | null
  creator_role_name: string | null
  assigned_role_names: string[]
  assigned_role_count: number
  assigned_team_names?: string[]
  effective_assigned_role_names?: string[]
  effective_assigned_role_count?: number
  status: string
  created_at: string | null
  updated_at: string | null
}

type ProjectsResponse = {
  success: boolean
  projects?: Project[]
  error?: string
}

type PgUser = {
  oid: number
  username: string
  can_login: boolean
  is_system_role: boolean
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [pgUsers, setPgUsers] = useState<PgUser[]>([])
  const [loadingPgUsers, setLoadingPgUsers] = useState(false)
  const [assignedRoleNames, setAssignedRoleNames] = useState<string[]>([])
  const [userSearch, setUserSearch] = useState("")

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

  const loadPgUsers = useCallback(async () => {
    setLoadingPgUsers(true)
    try {
      const response = await fetch("/api/db-users")
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to load PostgreSQL users")
      }

      const users = (result.users as PgUser[]).filter(
        (user) => !user.is_system_role && user.can_login
      )
      setPgUsers(users)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load database users")
      setPgUsers([])
    } finally {
      setLoadingPgUsers(false)
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

  useEffect(() => {
    if (editOpen) {
      void loadPgUsers()
    }
  }, [editOpen, loadPgUsers])

  const openDelete = (project: Project) => {
    setSelectedProject(project)
    setDeleteOpen(true)
  }

  const openEdit = (project: Project) => {
    setSelectedProject(project)
    setAssignedRoleNames([
      ...(project.effective_assigned_role_names ?? project.assigned_role_names),
    ])
    setUserSearch("")
    setEditOpen(true)
  }

  const creatorRoleName = selectedProject?.creator_role_name?.toLowerCase() ?? null

  const filteredPgUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase()
    return pgUsers.filter((user) => {
      if (creatorRoleName && user.username.toLowerCase() === creatorRoleName) {
        return false
      }
      if (!query) return true
      return user.username.toLowerCase().includes(query)
    })
  }, [creatorRoleName, pgUsers, userSearch])

  const toggleUserAssignment = (username: string, checked: boolean) => {
    setAssignedRoleNames((current) => {
      if (checked) {
        if (current.some((name) => name.toLowerCase() === username.toLowerCase())) {
          return current
        }
        return [...current, username].sort((a, b) => a.localeCompare(b))
      }
      return current.filter((name) => name.toLowerCase() !== username.toLowerCase())
    })
  }

  const handleSaveEdit = async () => {
    if (!selectedProject) return

    setSaving(true)
    try {
      const response = await fetch(`/api/projects/${selectedProject.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assigned_role_names: assignedRoleNames,
        }),
      })
      const result = (await response.json()) as { success?: boolean; error?: string }

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to update project users")
      }

      toast.success(`Project access updated for "${selectedProject.name}"`)
      setEditOpen(false)
      setSelectedProject(null)
      await loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update project users")
    } finally {
      setSaving(false)
    }
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
      assigned: projects.filter((project) => project.assigned_role_count > 0).length,
      unassigned: projects.filter((project) => project.assigned_role_count === 0).length,
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
            <CardTitle className="text-sm font-medium">Assigned projects</CardTitle>
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
              <TableHead>Creator</TableHead>
              <TableHead>Assigned Users</TableHead>
              <TableHead>Tables</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>DB owner</TableHead>
              <TableHead className="w-[150px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
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
                    {project.creator_role_name ? (
                      <Badge variant="secondary">{project.creator_role_name}</Badge>
                    ) : (
                      <Badge variant="outline">No creator</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {(project.effective_assigned_role_count ?? project.assigned_role_count) > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {(project.effective_assigned_role_names ?? project.assigned_role_names)
                          .slice(0, 2)
                          .map((roleName) => (
                            <Badge key={roleName} variant="outline">
                              {roleName}
                            </Badge>
                          ))}
                        {(project.effective_assigned_role_count ?? project.assigned_role_count) > 2 ? (
                          <Badge variant="secondary">
                            +
                            {(project.effective_assigned_role_count ?? project.assigned_role_count) - 2}
                          </Badge>
                        ) : null}
                      </div>
                    ) : (
                      <Badge variant="outline">No users</Badge>
                    )}
                    {project.assigned_team_names && project.assigned_team_names.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {project.assigned_team_names.map((teamName) => (
                          <Badge key={teamName} variant="secondary" className="text-[10px]">
                            Team: {teamName}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>{project.table_count}</TableCell>
                  <TableCell>{project.total_size}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{project.owner}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(project)}
                        title="Manage assigned users"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
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

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open)
          if (!open) {
            setAssignedRoleNames([])
            setUserSearch("")
          }
        }}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Manage project users</DialogTitle>
            <DialogDescription>
              Assign or unassign PostgreSQL users for{" "}
              <span className="font-medium">{selectedProject?.name}</span>
              <span className="font-mono text-xs"> ({selectedProject?.schema_name})</span>
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {selectedProject?.creator_role_name ? (
              <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Creator (always has access): </span>
                <span className="font-medium">{selectedProject.creator_role_name}</span>
              </div>
            ) : null}
            <div className="grid gap-2">
              <Label>Assigned PostgreSQL users</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search database users..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="max-h-56 overflow-y-auto rounded-lg border p-2 space-y-1">
                {loadingPgUsers ? (
                  <div className="flex items-center justify-center py-6 text-sm text-muted-foreground gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading database users...
                  </div>
                ) : filteredPgUsers.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No login-enabled database users found
                  </p>
                ) : (
                  filteredPgUsers.map((user) => {
                    const isAssigned = assignedRoleNames.some(
                      (name) => name.toLowerCase() === user.username.toLowerCase()
                    )
                    return (
                      <label
                        key={user.oid}
                        className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50 cursor-pointer"
                      >
                        <Checkbox
                          checked={isAssigned}
                          onCheckedChange={(checked) =>
                            toggleUserAssignment(user.username, checked === true)
                          }
                        />
                        <div>
                          <p className="text-sm font-medium">{user.username}</p>
                          <p className="text-xs text-muted-foreground">
                            {isAssigned ? "Assigned to project" : "Not assigned"}
                          </p>
                        </div>
                      </label>
                    )
                  })
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {assignedRoleNames.length} user
                {assignedRoleNames.length === 1 ? "" : "s"} with access. Changes sync with
                teams that have this project assigned (add/remove on both sides).
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save assignments"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
