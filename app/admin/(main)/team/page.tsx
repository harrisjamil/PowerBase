"use client"



import { useCallback, useEffect, useMemo, useState } from "react"

import {

  Users,

  Plus,

  RefreshCw,

  Trash2,

  MoreHorizontal,

  Calendar,

  UserPlus,

  Settings,

  Globe,

  Lock,

  Search,

  Loader2,

} from "lucide-react"

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

import { Input } from "@/components/ui/input"

import { Label } from "@/components/ui/label"

import { Textarea } from "@/components/ui/textarea"

import { useRouter } from "next/navigation"

import {

  Select,

  SelectContent,

  SelectItem,

  SelectTrigger,

  SelectValue,

} from "@/components/ui/select"

import { Checkbox } from "@/components/ui/checkbox"



type Team = {

  id: string

  name: string

  description: string

  memberCount: number

  createdAt: string

  updatedAt: string

  privacy: "public" | "private"

}



type PgUser = {

  oid: number

  username: string

  can_login: boolean

  is_system_role: boolean

}



export default function TeamsPage() {

  const router = useRouter()

  const [teams, setTeams] = useState<Team[]>([])

  const [loading, setLoading] = useState(true)

  const [refreshing, setRefreshing] = useState(false)

  const [deleteOpen, setDeleteOpen] = useState(false)

  const [createTeamOpen, setCreateTeamOpen] = useState(false)

  const [deleting, setDeleting] = useState(false)

  const [creating, setCreating] = useState(false)

  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)

  const [pgUsers, setPgUsers] = useState<PgUser[]>([])

  const [loadingPgUsers, setLoadingPgUsers] = useState(false)

  const [memberSearch, setMemberSearch] = useState("")

  const [newTeam, setNewTeam] = useState({

    name: "",

    description: "",

    privacy: "private" as "public" | "private",

    memberUsernames: [] as string[],

  })



  const loadData = useCallback(async () => {

    setLoading(true)

    try {

      const response = await fetch("/api/team")

      const result = await response.json()



      if (!response.ok || !result.success) {

        throw new Error(result.error || "Failed to load teams")

      }



      setTeams(result.teams ?? [])

    } catch (error) {

      console.error("Error loading teams:", error)

      toast.error(error instanceof Error ? error.message : "Failed to load teams")

      setTeams([])

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

      console.error("Error loading PG users:", error)

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

    loadData()

  }, [loadData])



  useEffect(() => {

    if (createTeamOpen) {

      void loadPgUsers()

    }

  }, [createTeamOpen, loadPgUsers])



  const openDelete = (team: Team) => {

    setSelectedTeam(team)

    setDeleteOpen(true)

  }



  const handleDelete = async () => {

    if (!selectedTeam) return



    setDeleting(true)

    try {

      const response = await fetch(`/api/team?id=${selectedTeam.id}`, {

        method: "DELETE",

      })

      const result = await response.json()



      if (!response.ok || !result.success) {

        throw new Error(result.error || "Failed to delete team")

      }



      toast.success(`Team "${selectedTeam.name}" has been deleted.`)

      await loadData()

      setDeleteOpen(false)

      setSelectedTeam(null)

    } catch (error) {

      toast.error(error instanceof Error ? error.message : "Failed to delete team")

    } finally {

      setDeleting(false)

    }

  }



  const toggleMember = (username: string, checked: boolean) => {

    setNewTeam((current) => ({

      ...current,

      memberUsernames: checked

        ? [...current.memberUsernames, username]

        : current.memberUsernames.filter((name) => name !== username),

    }))

  }



  const handleCreateTeam = async () => {

    if (!newTeam.name.trim()) {

      toast.error("Please enter a team name")

      return

    }



    setCreating(true)

    try {

      const response = await fetch("/api/team", {

        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({

          name: newTeam.name.trim(),

          description: newTeam.description.trim() || null,

          privacy: newTeam.privacy,

          memberUsernames: newTeam.memberUsernames,

        }),

      })

      const result = await response.json()



      if (!response.ok || !result.success) {

        throw new Error(result.error || "Failed to create team")

      }



      toast.success(`Team "${newTeam.name}" created successfully`)

      setCreateTeamOpen(false)

      setNewTeam({ name: "", description: "", privacy: "private", memberUsernames: [] })

      setMemberSearch("")

      await loadData()

    } catch (error) {

      toast.error(error instanceof Error ? error.message : "Failed to create team")

    } finally {

      setCreating(false)

    }

  }



  const filteredPgUsers = useMemo(() => {

    const query = memberSearch.trim().toLowerCase()

    if (!query) return pgUsers

    return pgUsers.filter((user) => user.username.toLowerCase().includes(query))

  }, [memberSearch, pgUsers])



  const stats = useMemo(

    () => ({

      total: teams.length,

      totalMembers: teams.reduce((sum, team) => sum + team.memberCount, 0),

      publicTeams: teams.filter((team) => team.privacy === "public").length,

      privateTeams: teams.filter((team) => team.privacy === "private").length,

    }),

    [teams]

  )



  const getInitials = (name: string) => {

    return name

      .split(" ")

      .map((n) => n[0])

      .join("")

      .toUpperCase()

      .slice(0, 2)

  }



  if (loading) {

    return (

      <div className="flex items-center justify-center min-h-[60vh]">

        <div className="text-sm text-muted-foreground">Loading teams...</div>

      </div>

    )

  }



  return (

    <div className="flex flex-col gap-6 px-4 py-4 md:px-6 md:py-6">

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">

        <div>

          <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">

            <Users className="h-5 w-5" />

            Teams

          </h1>

          <p className="text-sm text-muted-foreground">

            Create and manage teams with PostgreSQL database users.

          </p>

        </div>



        <div className="flex gap-2">

          <Button onClick={() => setCreateTeamOpen(true)} className="gap-2">

            <Plus className="h-4 w-4" />

            Create Team

          </Button>

          <Button onClick={handleRefresh} variant="outline" className="gap-2" disabled={refreshing}>

            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />

            Refresh

          </Button>

        </div>

      </div>



      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

        <Card className="hover:shadow-md transition-shadow">

          <CardHeader className="pb-2">

            <CardTitle className="text-sm font-medium text-muted-foreground">Total Teams</CardTitle>

          </CardHeader>

          <CardContent className="flex items-center justify-between">

            <span className="text-3xl font-bold">{stats.total}</span>

            <Users className="h-6 w-6 text-muted-foreground" />

          </CardContent>

        </Card>



        <Card className="hover:shadow-md transition-shadow">

          <CardHeader className="pb-2">

            <CardTitle className="text-sm font-medium text-muted-foreground">Total Members</CardTitle>

          </CardHeader>

          <CardContent className="flex items-center justify-between">

            <span className="text-3xl font-bold text-blue-600">{stats.totalMembers}</span>

            <UserPlus className="h-6 w-6 text-blue-600" />

          </CardContent>

        </Card>



        <Card className="hover:shadow-md transition-shadow">

          <CardHeader className="pb-2">

            <CardTitle className="text-sm font-medium text-muted-foreground">Public Teams</CardTitle>

          </CardHeader>

          <CardContent className="flex items-center justify-between">

            <span className="text-3xl font-bold text-emerald-600">{stats.publicTeams}</span>

            <Globe className="h-6 w-6 text-emerald-600" />

          </CardContent>

        </Card>



        <Card className="hover:shadow-md transition-shadow">

          <CardHeader className="pb-2">

            <CardTitle className="text-sm font-medium text-muted-foreground">Private Teams</CardTitle>

          </CardHeader>

          <CardContent className="flex items-center justify-between">

            <span className="text-3xl font-bold text-purple-600">{stats.privateTeams}</span>

            <Lock className="h-6 w-6 text-purple-600" />

          </CardContent>

        </Card>

      </div>



      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">

        <UITable>

          <TableHeader>

            <TableRow className="bg-muted/50">

              <TableHead className="w-[350px]">Team</TableHead>

              <TableHead>Members</TableHead>

              <TableHead>Privacy</TableHead>

              <TableHead>Created</TableHead>

              <TableHead>Last Updated</TableHead>

              <TableHead className="w-[70px]"></TableHead>

            </TableRow>

          </TableHeader>

          <TableBody>

            {teams.length === 0 ? (

              <TableRow>

                <TableCell colSpan={6} className="py-12 text-center">

                  <div className="flex flex-col items-center gap-2">

                    <Users className="h-12 w-12 text-muted-foreground/50" />

                    <p className="text-sm text-muted-foreground">No teams created yet</p>

                    <Button onClick={() => setCreateTeamOpen(true)} variant="outline" size="sm" className="mt-2">

                      <Plus className="h-4 w-4 mr-2" />

                      Create your first team

                    </Button>

                  </div>

                </TableCell>

              </TableRow>

            ) : (

              teams.map((team) => (

                <TableRow

                  key={team.id}

                  className="hover:bg-muted/30 transition-colors cursor-pointer"

                  onClick={() => router.push(`/admin/team/${team.id}`)}

                >

                  <TableCell>   

                    <div className="flex items-center gap-3">

                      <Avatar className="h-10 w-10">

                        <AvatarFallback className="bg-white text-black">

                          {getInitials(team.name)}

                        </AvatarFallback>

                      </Avatar>

                      <div>

                        <div className="font-medium">{team.name}</div>

                        <div className="text-sm text-muted-foreground line-clamp-1">

                          {team.description || "No description"}

                        </div>

                      </div>

                    </div>

                  </TableCell>

                  <TableCell>

                    <div className="flex items-center gap-2">

                      <Users className="h-4 w-4 text-muted-foreground" />

                      <span className="font-medium">{team.memberCount}</span>

                      <span className="text-sm text-muted-foreground">

                        {team.memberCount === 1 ? "member" : "members"}

                      </span>

                    </div>

                  </TableCell>

                  <TableCell>

                    <Badge

                      variant="secondary"

                      className={

                        team.privacy === "public"

                          ? "bg-emerald-100 text-emerald-700 border-emerald-200"

                          : "bg-purple-100 text-purple-700 border-purple-200"

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

                  </TableCell>

                  <TableCell>

                    <div className="flex items-center gap-1 text-sm">

                      <Calendar className="h-3 w-3 text-muted-foreground" />

                      {new Date(team.createdAt).toLocaleDateString()}

                    </div>

                  </TableCell>

                  <TableCell>

                    <div className="text-sm text-muted-foreground">

                      {new Date(team.updatedAt).toLocaleDateString()}

                    </div>

                  </TableCell>

                  <TableCell onClick={(e) => e.stopPropagation()}>

                    <DropdownMenu>

                      <DropdownMenuTrigger asChild>

                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">

                          <MoreHorizontal className="h-4 w-4" />

                        </Button>

                      </DropdownMenuTrigger>

                      <DropdownMenuContent align="end" className="w-48">

                        <DropdownMenuLabel>Actions</DropdownMenuLabel>

                        <DropdownMenuItem onClick={() => router.push(`/admin/team/${team.id}`)}>

                          <Users className="mr-2 h-4 w-4" />

                          View team

                        </DropdownMenuItem>

                        <DropdownMenuItem>

                          <Settings className="mr-2 h-4 w-4" />

                          Settings

                        </DropdownMenuItem>

                        <DropdownMenuSeparator />

                        <DropdownMenuItem

                          className="text-red-600 focus:text-red-600"

                          onClick={() => openDelete(team)}

                        >

                          <Trash2 className="mr-2 h-4 w-4" />

                          Delete team

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



      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>

        <DialogContent>

          <DialogHeader>

            <DialogTitle>Delete team</DialogTitle>

            <DialogDescription>

              Are you sure you want to delete &quot;{selectedTeam?.name}&quot;? This action cannot be undone.

              All team members will lose access.

            </DialogDescription>

          </DialogHeader>

          <DialogFooter>

            <Button variant="outline" onClick={() => setDeleteOpen(false)}>

              Cancel

            </Button>

            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>

              {deleting ? "Deleting..." : "Delete"}

            </Button>

          </DialogFooter>

        </DialogContent>

      </Dialog>



      <Dialog

        open={createTeamOpen}

        onOpenChange={(open) => {

          setCreateTeamOpen(open)

          if (!open) {

            setNewTeam({ name: "", description: "", privacy: "private", memberUsernames: [] })

            setMemberSearch("")

          }

        }}

      >

        <DialogContent className="sm:max-w-[560px]">

          <DialogHeader>

            <DialogTitle>Create new team</DialogTitle>

            <DialogDescription>

              Create a team and assign PostgreSQL database users as members.

            </DialogDescription>

          </DialogHeader>

          <div className="grid gap-4 py-4">

            <div className="grid gap-2">

              <Label htmlFor="name">Team name *</Label>

              <Input

                id="name"

                placeholder="e.g., Engineering Team"

                value={newTeam.name}

                onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}

              />

            </div>

            <div className="grid gap-2">

              <Label htmlFor="description">Description</Label>

              <Textarea

                id="description"

                placeholder="What is this team responsible for?"

                value={newTeam.description}

                onChange={(e) => setNewTeam({ ...newTeam, description: e.target.value })}

                rows={3}

              />

            </div>

            <div className="grid gap-2">

              <Label htmlFor="privacy">Privacy</Label>

              <Select

                value={newTeam.privacy}

                onValueChange={(value: "public" | "private") =>

                  setNewTeam({ ...newTeam, privacy: value })

                }

              >

                <SelectTrigger className="w-full">

                  <SelectValue />

                </SelectTrigger>

                <SelectContent>

                  <SelectItem value="private">Private — only invited members</SelectItem>

                  <SelectItem value="public">Public — visible to everyone</SelectItem>

                </SelectContent>

              </Select>

            </div>

            <div className="grid gap-2">

              <Label>Team members (PostgreSQL users)</Label>

              <div className="relative">

                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

                <Input

                  placeholder="Search database users..."

                  value={memberSearch}

                  onChange={(e) => setMemberSearch(e.target.value)}

                  className="pl-9"

                />

              </div>

              <div className="max-h-48 overflow-y-auto rounded-lg border p-2 space-y-1">

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

                  filteredPgUsers.map((user) => (

                    <label

                      key={user.oid}

                      className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50 cursor-pointer"

                    >

                      <Checkbox

                        checked={newTeam.memberUsernames.includes(user.username)}

                        onCheckedChange={(checked) =>

                          toggleMember(user.username, checked === true)

                        }

                      />

                      <div>

                        <p className="text-sm font-medium">{user.username}</p>

                        <p className="text-xs text-muted-foreground">PostgreSQL login user</p>

                      </div>

                    </label>

                  ))

                )}

              </div>

              {newTeam.memberUsernames.length > 0 && (

                <p className="text-xs text-muted-foreground">

                  {newTeam.memberUsernames.length} user

                  {newTeam.memberUsernames.length === 1 ? "" : "s"} selected. The first selected user

                  becomes team admin.

                </p>

              )}

            </div>

          </div>

          <DialogFooter>

            <Button variant="outline" onClick={() => setCreateTeamOpen(false)}>

              Cancel

            </Button>

            <Button onClick={handleCreateTeam} disabled={creating}>

              {creating ? (

                <>

                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />

                  Creating...

                </>

              ) : (

                <>

                  <Plus className="h-4 w-4 mr-2" />

                  Create team

                </>

              )}

            </Button>

          </DialogFooter>

        </DialogContent>

      </Dialog>

    </div>

  )

}

