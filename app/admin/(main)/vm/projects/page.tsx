"use client"

import { useEffect, useState } from "react"
import {
  FolderKanban,
  Plus,
  RefreshCw,
  Calendar,
  User,
  CheckCircle2,
  Clock,
  MoreVertical,
  Edit,
  Trash2,
  Copy,
  ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table as UITable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { CreateProjectModal, ProjectFormData } from "@/components/modals/CreateProjectModal"

type Project = {
  id: string
  name: string
  description: string | null
  status: "active" | "archived" | "draft"
  created_at: string
  updated_at: string
  owner: string
  member_count: number
  region?: string
  postgresType?: string
}

type ProjectStats = {
  total: number
  active: number
  archived: number
  draft: number
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [stats, setStats] = useState<ProjectStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<"all" | "active" | "archived" | "draft">("all")
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    status: "active" as Project["status"],
  })
  const [saving, setSaving] = useState(false)

  // Fetch projects - replace with your actual API
  const fetchProjects = async (): Promise<Project[]> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve([
          {
            id: "1",
            name: "E-commerce Platform",
            description: "Main online store with payment integration and inventory management",
            status: "active",
            created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
            owner: "alice@example.com",
            member_count: 5,
            region: "us-east-1",
            postgresType: "postgres",
          },
          {
            id: "2",
            name: "Analytics Dashboard",
            description: "Real-time business intelligence and reporting dashboard",
            status: "active",
            created_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
            updated_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
            owner: "bob@example.com",
            member_count: 3,
            region: "eu-west-1",
          },
          {
            id: "3",
            name: "Mobile App Backend",
            description: "API services for iOS and Android applications",
            status: "draft",
            created_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
            updated_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
            owner: "alice@example.com",
            member_count: 2,
          },
          {
            id: "4",
            name: "Legacy CRM",
            description: "Customer relationship management system (deprecated)",
            status: "archived",
            created_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
            updated_at: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
            owner: "carol@example.com",
            member_count: 0,
          },
        ])
      }, 500)
    })
  }

  const fetchStats = async (): Promise<ProjectStats> => {
    return {
      total: 4,
      active: 2,
      archived: 1,
      draft: 1,
    }
  }

  const createProject = async (data: ProjectFormData) => {
    // Replace with your actual API call
    console.log("Creating project with data:", data)
    
    // Simulate API call
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const newProject: Project = {
          id: String(Date.now()),
          name: data.name,
          description: data.description || null,
          status: "active",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          owner: "current@user.com",
          member_count: 1,
          region: data.region,
          postgresType: data.postgresType,
        }
        setProjects((prev) => [newProject, ...prev])
        if (stats) {
          setStats({
            ...stats,
            total: stats.total + 1,
            active: stats.active + 1,
          })
        }
        resolve()
      }, 1000)
    })
  }

  const updateProject = async (id: string, data: Partial<typeof formData>) => {
    return true
  }

  const deleteProject = async (id: string) => {
    return true
  }

  const loadData = async () => {
    setLoading(true)
    const [projectsData, statsData] = await Promise.all([fetchProjects(), fetchStats()])
    setProjects(projectsData)
    setStats(statsData)
    setLoading(false)
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }

  const handleCreateProject = async (data: ProjectFormData) => {
    setSaving(true)
    try {
      await createProject(data)
      toast.success(`Project "${data.name}" created successfully`)
      setShowCreateModal(false)
    } catch (error) {
      toast.error("Failed to create project")
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async () => {
    if (!selectedProject) return
    if (!formData.name.trim()) {
      toast.error("Project name is required")
      return
    }

    setSaving(true)
    try {
      const success = await updateProject(selectedProject.id, {
        name: formData.name,
        description: formData.description,
        status: formData.status,
      })
      if (success) {
        const updatedProjects = projects.map((p) =>
          p.id === selectedProject.id
            ? {
                ...p,
                name: formData.name,
                description: formData.description || null,
                status: formData.status,
                updated_at: new Date().toISOString(),
              }
            : p
        )
        setProjects(updatedProjects)

        if (stats && selectedProject.status !== formData.status) {
          setStats({
            ...stats,
            [selectedProject.status]: stats[selectedProject.status] - 1,
            [formData.status]: stats[formData.status] + 1,
          })
        }

        toast.success(`Project "${formData.name}" updated`)
        setShowEditModal(false)
        setSelectedProject(null)
      } else {
        toast.error("Failed to update project")
      }
    } catch (error) {
      toast.error("Failed to update project")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (project: Project) => {
    if (!confirm(`Delete project "${project.name}"? This action cannot be undone.`)) return

    try {
      const success = await deleteProject(project.id)
      if (success) {
        setProjects(projects.filter((p) => p.id !== project.id))
        if (stats) {
          setStats({
            ...stats,
            total: stats.total - 1,
            [project.status]: stats[project.status] - 1,
          })
        }
        toast.success(`Project "${project.name}" deleted`)
      } else {
        toast.error("Failed to delete project")
      }
    } catch (error) {
      toast.error("Failed to delete project")
    }
  }

  const openEditModal = (project: Project) => {
    setSelectedProject(project)
    setFormData({
      name: project.name,
      description: project.description || "",
      status: project.status,
    })
    setShowEditModal(true)
  }

  useEffect(() => {
    loadData()
  }, [])

  const getStatusBadge = (status: Project["status"]) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge>
      case "archived":
        return <Badge variant="secondary" className="bg-gray-100 text-gray-800">Archived</Badge>
      case "draft":
        return <Badge variant="outline" className="border-amber-200 text-amber-700">Draft</Badge>
    }
  }

  const filteredProjects = projects.filter((p) => (activeTab === "all" ? true : p.status === activeTab))

  const formatDate = (date: string) => {
    const d = new Date(date)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return "Today"
    if (diffDays === 1) return "Yesterday"
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    return d.toLocaleDateString()
  }

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
            Manage your organization's projects. Track status, members, and activity across all
            initiatives.
          </p>
        </div>

        <div className="flex gap-2">
          <Button onClick={() => setShowCreateModal(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New project
          </Button>
          <Button onClick={handleRefresh} variant="outline" className="gap-2" disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <FolderKanban className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </div>
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-2xl font-bold text-green-600">{stats.active}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500/50" />
            </div>
          </div>
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Draft</p>
                <p className="text-2xl font-bold text-amber-600">{stats.draft}</p>
              </div>
              <Clock className="h-8 w-8 text-amber-500/50" />
            </div>
          </div>
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Archived</p>
                <p className="text-2xl font-bold text-gray-500">{stats.archived}</p>
              </div>
              <Calendar className="h-8 w-8 text-gray-400/50" />
            </div>
          </div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="gap-4">
        <TabsList variant="line" className="w-full flex-wrap justify-start">
          <TabsTrigger value="all">All projects</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="draft">Draft</TabsTrigger>
          <TabsTrigger value="archived">Archived</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="flex flex-col gap-4">
          <div className="border rounded-xl bg-white shadow-sm overflow-x-auto">
            <UITable>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="text-center">Members</TableHead>
                  <TableHead>Last updated</TableHead>
                  <TableHead className="w-[70px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FolderKanban className="h-4 w-4 text-muted-foreground" />
                        <span>{project.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-md truncate">
                      {project.description || "—"}
                    </TableCell>
                    <TableCell>{getStatusBadge(project.status)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm">{project.owner.split("@")[0]}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="font-mono">
                        {project.member_count}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(project.updated_at)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditModal(project)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Copy className="h-4 w-4 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Open
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(project)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </UITable>
            {filteredProjects.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No projects found in this category.
                <Button variant="link" className="ml-2" onClick={() => setShowCreateModal(true)}>
                  Create one →
                </Button>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Create Project Modal - Reusable Component */}
      <CreateProjectModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        onSubmit={handleCreateProject}
        organizations={[
          { id: "1", name: "Haris Mian's Org", plan: "Free" },
        ]}
        isSubmitting={saving}
      />

      {/* Edit Project Dialog */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit project</DialogTitle>
            <DialogDescription>Update project details and status.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Project name *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => 
                  setFormData({ ...formData, description: e.target.value })
                }
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-status">Status</Label>
              <div className="flex gap-4">
                {(["active", "draft", "archived"] as const).map((status) => (
                  <label key={status} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="edit-status"
                      value={status}
                      checked={formData.status === status}
                      onChange={() => setFormData({ ...formData, status })}
                      className="h-4 w-4"
                    />
                    <span className="text-sm capitalize">{status}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}