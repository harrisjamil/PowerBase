"use client"

import { useParams, useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Users,
  ArrowLeft,
  Mail,
  Calendar,
  MoreHorizontal,
  Trash2,
  Edit2,
  UserPlus,
  Shield,
  UserCheck,
  Clock,
  Globe,
  Lock,
  Loader2,
  FolderKanban,
  Database,
  Search,
} from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type TeamMember = {
  id: string
  name: string
  email: string
  role: "admin" | "member" | "viewer"
  status: "active" | "invited" | "disabled"
  joinedAt: string
  pgUsername: string
  canLogin: boolean
}

type Team = {
  id: string
  name: string
  description: string
  memberCount: number
  createdAt: string
  updatedAt: string
  privacy: "public" | "private"
  owner: string
}

type PgUser = {
  oid: number
  username: string
  can_login: boolean
  is_system_role: boolean
}

type TeamProject = {
  id: string
  assignmentId: string
  projectId: number
  projectRef: string
  name: string
  schemaName: string
  description: string
  status: string
  assignedAt: string
}

type ProjectOption = {
  id: number
  name: string
  schema_name: string
  description: string | null
  status: string
  project_ref?: string
}

const roleConfig = {
  admin: { label: "Admin", color: "bg-purple-100 text-purple-700 border-purple-200" },
  member: { label: "Member", color: "bg-blue-100 text-blue-700 border-blue-200" },
  viewer: { label: "Viewer", color: "bg-gray-100 text-gray-700 border-gray-200" },
}

const statusConfig = {
  active: { label: "Active", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  invited: { label: "Invited", color: "bg-amber-100 text-amber-700 border-amber-200" },
  disabled: { label: "Disabled", color: "bg-red-100 text-red-700 border-red-200" },
}

export default function TeamDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const teamId = params.id as string

  const [team, setTeam] = useState<Team | null>(null)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [teamProjects, setTeamProjects] = useState<TeamProject[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteMemberOpen, setDeleteMemberOpen] = useState(false)
  const [editMemberOpen, setEditMemberOpen] = useState(false)
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [assignProjectOpen, setAssignProjectOpen] = useState(false)
  const [unassignProjectOpen, setUnassignProjectOpen] = useState(false)
  const [selectedProject, setSelectedProject] = useState<TeamProject | null>(null)
  const [allProjects, setAllProjects] = useState<ProjectOption[]>([])
  const [loadingAllProjects, setLoadingAllProjects] = useState(false)
  const [assigningProjects, setAssigningProjects] = useState(false)
  const [unassigningProject, setUnassigningProject] = useState(false)
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([])
  const [projectSearch, setProjectSearch] = useState("")
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null)
  const [editingMember, setEditingMember] = useState({
    role: "member" as "admin" | "member" | "viewer",
    status: "active" as "active" | "invited" | "disabled",
  })
  const [pgUsers, setPgUsers] = useState<PgUser[]>([])
  const [loadingPgUsers, setLoadingPgUsers] = useState(false)
  const [addingMember, setAddingMember] = useState(false)
  const [savingMember, setSavingMember] = useState(false)
  const [removingMember, setRemovingMember] = useState(false)
  const [newMember, setNewMember] = useState({
    pgUsername: "",
    role: "member" as "admin" | "member" | "viewer",
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [teamResponse, membersResponse, projectsResponse] = await Promise.all([
        fetch(`/api/team/${teamId}`),
        fetch(`/api/team/${teamId}/members`),
        fetch(`/api/team/${teamId}/projects`),
      ])

      const teamResult = await teamResponse.json()
      const membersResult = await membersResponse.json()
      const projectsResult = await projectsResponse.json()

      if (!teamResponse.ok || !teamResult.success) {
        throw new Error(teamResult.error || "Failed to load team")
      }

      if (!membersResponse.ok || !membersResult.success) {
        throw new Error(membersResult.error || "Failed to load team members")
      }

      if (!projectsResponse.ok || !projectsResult.success) {
        throw new Error(projectsResult.error || "Failed to load team projects")
      }

      setTeam(teamResult.team)
      setMembers(membersResult.members ?? [])
      setTeamProjects(projectsResult.projects ?? [])
    } catch (error) {
      console.error("Error loading team data:", error)
      toast.error(error instanceof Error ? error.message : "Failed to load team")
      setTeam(null)
      setMembers([])
      setTeamProjects([])
    } finally {
      setLoading(false)
    }
  }, [teamId])

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
      console.error("Error loading PG users:", error)
      toast.error(error instanceof Error ? error.message : "Failed to load database users")
      setPgUsers([])
    } finally {
      setLoadingPgUsers(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const loadAllProjects = useCallback(async () => {
    setLoadingAllProjects(true)
    try {
      const response = await fetch("/api/projects")
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to load projects")
      }

      setAllProjects(result.projects ?? [])
    } catch (error) {
      console.error("Error loading projects:", error)
      toast.error(error instanceof Error ? error.message : "Failed to load projects")
      setAllProjects([])
    } finally {
      setLoadingAllProjects(false)
    }
  }, [])

  useEffect(() => {
    if (addMemberOpen) {
      void loadPgUsers()
    }
  }, [addMemberOpen, loadPgUsers])

  useEffect(() => {
    if (assignProjectOpen) {
      void loadAllProjects()
    }
  }, [assignProjectOpen, loadAllProjects])

  const availablePgUsers = useMemo(() => {
    const existing = new Set(members.map((member) => member.pgUsername))
    return pgUsers.filter((user) => !existing.has(user.username))
  }, [members, pgUsers])

  const assignedProjectIdSet = useMemo(
    () => new Set(teamProjects.map((project) => project.projectId)),
    [teamProjects]
  )

  const availableProjects = useMemo(() => {
    const query = projectSearch.trim().toLowerCase()
    return allProjects
      .filter((project) => !assignedProjectIdSet.has(project.id))
      .filter((project) => {
        if (!query) return true
        return (
          project.name.toLowerCase().includes(query) ||
          project.schema_name.toLowerCase().includes(query)
        )
      })
  }, [allProjects, assignedProjectIdSet, projectSearch])

  const toggleProjectSelection = (projectId: number, checked: boolean) => {
    setSelectedProjectIds((current) =>
      checked
        ? [...current, projectId]
        : current.filter((id) => id !== projectId)
    )
  }

  const handleAssignProjects = async () => {
    if (selectedProjectIds.length === 0) {
      toast.error("Select at least one project")
      return
    }

    setAssigningProjects(true)
    try {
      const response = await fetch(`/api/team/${teamId}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectIds: selectedProjectIds }),
      })
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to assign projects")
      }

      toast.success(
        selectedProjectIds.length === 1
          ? "Project assigned to team"
          : `${selectedProjectIds.length} projects assigned to team`
      )
      setAssignProjectOpen(false)
      setSelectedProjectIds([])
      setProjectSearch("")
      await loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to assign projects")
    } finally {
      setAssigningProjects(false)
    }
  }

  const handleUnassignProject = async () => {
    if (!selectedProject) return

    setUnassigningProject(true)
    try {
      const response = await fetch(
        `/api/team/${teamId}/projects?projectId=${selectedProject.projectId}`,
        { method: "DELETE" }
      )
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to unassign project")
      }

      toast.success(`"${selectedProject.name}" removed from team`)
      setUnassignProjectOpen(false)
      setSelectedProject(null)
      await loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to unassign project")
    } finally {
      setUnassigningProject(false)
    }
  }

  const handleAddMember = async () => {
    if (!newMember.pgUsername) {
      toast.error("Please select a database user")
      return
    }

    setAddingMember(true)
    try {
      const response = await fetch(`/api/team/${teamId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pgUsername: newMember.pgUsername,
          role: newMember.role,
        }),
      })
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to add team member")
      }

      toast.success(`${newMember.pgUsername} added to the team`)
      setAddMemberOpen(false)
      setNewMember({ pgUsername: "", role: "member" })
      await loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add team member")
    } finally {
      setAddingMember(false)
    }
  }

  const openEditMember = (member: TeamMember) => {
    setSelectedMember(member)
    setEditingMember({ role: member.role, status: member.status })
    setEditMemberOpen(true)
  }

  const handleSaveMember = async () => {
    if (!selectedMember) return

    setSavingMember(true)
    try {
      const response = await fetch(`/api/team/${teamId}/members`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: selectedMember.id,
          role: editingMember.role,
          status: editingMember.status,
        }),
      })
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to update team member")
      }

      toast.success(`${selectedMember.name} updated successfully`)
      setEditMemberOpen(false)
      setSelectedMember(null)
      await loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update team member")
    } finally {
      setSavingMember(false)
    }
  }

  const handleRemoveMember = async () => {
    if (!selectedMember) return

    setRemovingMember(true)
    try {
      const response = await fetch(
        `/api/team/${teamId}/members?memberId=${selectedMember.id}`,
        { method: "DELETE" }
      )
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to remove team member")
      }

      toast.success(`${selectedMember.name} has been removed from the team`)
      setDeleteMemberOpen(false)
      setSelectedMember(null)
      await loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove team member")
    } finally {
      setRemovingMember(false)
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  const stats = {
    totalMembers: members.length,
    activeMembers: members.filter((m) => m.status === "active").length,
    admins: members.filter((m) => m.role === "admin").length,
    pendingInvites: members.filter((m) => m.status === "invited").length,
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-sm text-muted-foreground">Loading team details...</div>
      </div>
    )
  }

  if (!team) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-muted-foreground">Team not found</p>
        <Button onClick={() => router.push("/admin/team")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Teams
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-4 md:px-6 md:py-6">
      <div className="flex flex-col gap-4">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit gap-2"
          onClick={() => router.push("/admin/team")}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Teams
        </Button>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              {team.name}
              <Badge
                variant="secondary"
                className={
                  team.privacy === "public"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-purple-100 text-purple-700"
                }
              >
                {team.privacy === "public" ? (
                  <>
                    <Globe className="h-3 w-3 mr-1" />
                    Public
                  </>
                ) : (
                  <>
                    <Lock className="h-3 w-3 mr-1" />
                    Private
                  </>
                )}
              </Badge>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{team.description || "No description"}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setAddMemberOpen(true)} className="gap-2">
              <UserPlus className="h-4 w-4" />
              Add Member
            </Button>
            <Button onClick={() => setAssignProjectOpen(true)} variant="outline" className="gap-2">
              <FolderKanban className="h-4 w-4" />
              Assign Project
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Members</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-3xl font-bold">{stats.totalMembers}</span>
            <Users className="h-6 w-6 text-muted-foreground" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Members</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-3xl font-bold text-emerald-600">{stats.activeMembers}</span>
            <UserCheck className="h-6 w-6 text-emerald-600" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Administrators</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-3xl font-bold text-purple-600">{stats.admins}</span>
            <Shield className="h-6 w-6 text-purple-600" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Invites</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-3xl font-bold text-amber-600">{stats.pendingInvites}</span>
            <Mail className="h-6 w-6 text-amber-600" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Team Information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="text-muted-foreground">Team Owner</Label>
            <p className="font-medium mt-1">{team.owner}</p>
          </div>
          <div>
            <Label className="text-muted-foreground">Created</Label>
            <p className="font-medium mt-1 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {new Date(team.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div>
            <Label className="text-muted-foreground">Last Updated</Label>
            <p className="font-medium mt-1 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {new Date(team.updatedAt).toLocaleDateString()}
            </p>
          </div>
          <div>
            <Label className="text-muted-foreground">Privacy</Label>
            <p className="font-medium mt-1 capitalize">{team.privacy}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">Assigned Projects</CardTitle>
          <Badge variant="secondary">{teamProjects.length} assigned</Badge>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border">
            <UITable>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[280px]">Project</TableHead>
                  <TableHead>Schema</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead className="w-[70px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamProjects.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <FolderKanban className="h-12 w-12 text-muted-foreground/50" />
                        <p className="text-sm text-muted-foreground">No projects assigned yet</p>
                        <Button onClick={() => setAssignProjectOpen(true)} variant="outline" size="sm">
                          <FolderKanban className="h-4 w-4 mr-2" />
                          Assign your first project
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  teamProjects.map((project) => (
                    <TableRow key={project.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell>
                        <div className="font-medium">{project.name}</div>
                        {project.description ? (
                          <p className="text-sm text-muted-foreground line-clamp-1">{project.description}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Database className="h-3 w-3 text-muted-foreground" />
                          {project.schemaName}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {project.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          {new Date(project.assignedAt).toLocaleDateString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem
                              className="text-red-600 focus:text-red-600"
                              onClick={() => {
                                setSelectedProject(project)
                                setUnassignProjectOpen(true)
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Unassign project
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </UITable>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Team Members</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border">
            <UITable>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[300px]">Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Can login</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-[70px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Users className="h-12 w-12 text-muted-foreground/50" />
                        <p className="text-sm text-muted-foreground">No team members yet</p>
                        <Button onClick={() => setAddMemberOpen(true)} variant="outline" size="sm">
                          <UserPlus className="h-4 w-4 mr-2" />
                          Add your first member
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  members.map((member) => (
                    <TableRow key={member.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white">
                              {getInitials(member.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{member.name}</div>
                            <div className="text-sm text-muted-foreground flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {member.email}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={roleConfig[member.role].color}>
                          {roleConfig[member.role].label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusConfig[member.status].color}>
                          {statusConfig[member.status].label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {member.canLogin ? "Yes" : "No"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          {new Date(member.joinedAt).toLocaleDateString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => openEditMember(member)}>
                              <Edit2 className="mr-2 h-4 w-4" />
                              Edit member
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600 focus:text-red-600"
                              onClick={() => {
                                setSelectedMember(member)
                                setDeleteMemberOpen(true)
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Remove member
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </UITable>
          </div>
        </CardContent>
      </Card>

      <Dialog open={editMemberOpen} onOpenChange={setEditMemberOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit team member</DialogTitle>
            <DialogDescription>
              Update role and status for {selectedMember?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Database user</Label>
              <p className="text-sm font-medium rounded-lg border bg-muted/30 px-3 py-2">
                {selectedMember?.pgUsername}
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-role">Role</Label>
              <Select
                value={editingMember.role}
                onValueChange={(value: "admin" | "member" | "viewer") =>
                  setEditingMember({ ...editingMember, role: value })
                }
              >
                <SelectTrigger id="edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin — Full access</SelectItem>
                  <SelectItem value="member">Member — Standard access</SelectItem>
                  <SelectItem value="viewer">Viewer — Read only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-status">Status</Label>
              <Select
                value={editingMember.status}
                onValueChange={(value: "active" | "invited" | "disabled") =>
                  setEditingMember({ ...editingMember, status: value })
                }
              >
                <SelectTrigger id="edit-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="invited">Invited</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMemberOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveMember} disabled={savingMember}>
              {savingMember ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteMemberOpen} onOpenChange={setDeleteMemberOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove team member</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove {selectedMember?.name} from {team.name}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteMemberOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemoveMember} disabled={removingMember}>
              {removingMember ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add team member to {team.name}</DialogTitle>
            <DialogDescription>
              Select a PostgreSQL database user to add to this team.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Database user *</Label>
              {loadingPgUsers ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading users...
                </div>
              ) : (
                <Select
                  value={newMember.pgUsername}
                  onValueChange={(value) => setNewMember({ ...newMember, pgUsername: value })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a database user" />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePgUsers.length === 0 ? (
                      <SelectItem value="__none" disabled>
                        No available users
                      </SelectItem>
                    ) : (
                      availablePgUsers.map((user) => (
                        <SelectItem key={user.oid} value={user.username}>
                          {user.username}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role">Role</Label>
              <Select
                value={newMember.role}
                onValueChange={(value: "admin" | "member" | "viewer") =>
                  setNewMember({ ...newMember, role: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin — Full access</SelectItem>
                  <SelectItem value="member">Member — Standard access</SelectItem>
                  <SelectItem value="viewer">Viewer — Read only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMemberOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddMember} disabled={addingMember || !newMember.pgUsername}>
              {addingMember ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add member
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={assignProjectOpen}
        onOpenChange={(open) => {
          setAssignProjectOpen(open)
          if (!open) {
            setSelectedProjectIds([])
            setProjectSearch("")
          }
        }}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Assign projects to {team.name}</DialogTitle>
            <DialogDescription>
              Select projects from your existing PowerBase projects to assign to this team.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Projects</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search projects..."
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border p-2 space-y-1">
                {loadingAllProjects ? (
                  <div className="flex items-center justify-center py-6 text-sm text-muted-foreground gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading projects...
                  </div>
                ) : availableProjects.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    {allProjects.length === 0
                      ? "No projects found. Create projects first on the Projects page."
                      : "All projects are already assigned to this team"}
                  </p>
                ) : (
                  availableProjects.map((project) => (
                    <label
                      key={project.id}
                      className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedProjectIds.includes(project.id)}
                        onCheckedChange={(checked) =>
                          toggleProjectSelection(project.id, checked === true)
                        }
                      />
                      <div>
                        <p className="text-sm font-medium">{project.name}</p>
                        <p className="text-xs text-muted-foreground">{project.schema_name}</p>
                      </div>
                    </label>
                  ))
                )}
              </div>
              {selectedProjectIds.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedProjectIds.length} project
                  {selectedProjectIds.length === 1 ? "" : "s"} selected
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignProjectOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAssignProjects}
              disabled={assigningProjects || selectedProjectIds.length === 0}
            >
              {assigningProjects ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Assigning...
                </>
              ) : (
                <>
                  <FolderKanban className="h-4 w-4 mr-2" />
                  Assign projects
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={unassignProjectOpen} onOpenChange={setUnassignProjectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unassign project</DialogTitle>
            <DialogDescription>
              Remove &quot;{selectedProject?.name}&quot; from {team.name}? The project itself will not be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnassignProjectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleUnassignProject}
              disabled={unassigningProject}
            >
              {unassigningProject ? "Removing..." : "Unassign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
