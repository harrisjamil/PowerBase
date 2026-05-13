"use client"

import { useEffect, useMemo, useState } from "react"
import {
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

type Superadmin = {
  id: number
  email: string
  has_password: boolean
  created_at: string | null
  test: string | null
}

type SuperadminsResponse = {
  success: boolean
  users?: Superadmin[]
  count?: number
  schema?: string
  table?: string
  error?: string
}

type SuperadminFormState = {
  email: string
  password: string
  test: string
}

type SessionResponse = {
  success: boolean
  user?: {
    email?: string
  }
}

const EMPTY_FORM: SuperadminFormState = {
  email: "",
  password: "",
  test: "",
}

export default function AdminPage() {
  const [users, setUsers] = useState<Superadmin[]>([])
  const [schemaName, setSchemaName] = useState<string | null>(null)
  const [tableName, setTableName] = useState<string | null>(null)
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [selectedUser, setSelectedUser] = useState<Superadmin | null>(null)
  const [form, setForm] = useState<SuperadminFormState>(EMPTY_FORM)

  const requestUsers = async (): Promise<SuperadminsResponse> => {
    const res = await fetch("/api/superadmins")
    const data = (await res.json()) as SuperadminsResponse
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Failed to fetch superadmins")
    }
    return data
  }

  const applyUsersResponse = (data: SuperadminsResponse) => {
    setUsers(data.users ?? [])
    setSchemaName(data.schema ?? null)
    setTableName(data.table ?? null)
  }

  const refreshUsers = async (showLoading = false) => {
    if (showLoading) setRefreshing(true)
    try {
      const data = await requestUsers()
      applyUsersResponse(data)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to fetch superadmins")
    } finally {
      if (showLoading) setRefreshing(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [data, sessionRes] = await Promise.all([
          requestUsers(),
          fetch("/api/session", { credentials: "same-origin" }),
        ])
        const sessionData = (await sessionRes.json()) as SessionResponse
        if (!cancelled) {
          applyUsersResponse(data)
          if (sessionRes.ok && sessionData.user?.email) {
            setCurrentUserEmail(sessionData.user.email.trim().toLowerCase())
          }
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Failed to fetch superadmins")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const filteredUsers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return users
    return users.filter((user) => user.email.toLowerCase().includes(q))
  }, [searchTerm, users])

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setSelectedUser(null)
  }

  const openEdit = (user: Superadmin) => {
    setSelectedUser(user)
    setForm({
      email: user.email,
      password: "",
      test: user.test ?? "",
    })
    setEditOpen(true)
  }

  const openDelete = (user: Superadmin) => {
    setSelectedUser(user)
    setDeleteOpen(true)
  }

  const handleCreate = async () => {
    if (!form.email.trim() || !form.password) {
      toast.error("Email and password are required.")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/superadmins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = (await res.json()) as { success?: boolean; error?: string }
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to create superadmin")
      }
      toast.success(`Superadmin ${form.email.trim()} created.`)
      setCreateOpen(false)
      resetForm()
      await refreshUsers()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create superadmin")
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdate = async () => {
    if (!selectedUser) return

    setSubmitting(true)
    try {
      const res = await fetch("/api/superadmins", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedUser.id,
          email: form.email,
          password: form.password,
          test: form.test,
        }),
      })
      const data = (await res.json()) as { success?: boolean; error?: string }
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to update superadmin")
      }
      toast.success(`Superadmin ${selectedUser.email} updated.`)
      setEditOpen(false)
      resetForm()
      await refreshUsers()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update superadmin")
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedUser) return

    setSubmitting(true)
    try {
      const res = await fetch(
        `/api/superadmins?id=${encodeURIComponent(String(selectedUser.id))}`,
        { method: "DELETE" }
      )
      const data = (await res.json()) as { success?: boolean; error?: string }
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete superadmin")
      }
      toast.success(`Superadmin ${selectedUser.email} deleted.`)
      setDeleteOpen(false)
      resetForm()
      await refreshUsers()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete superadmin")
    } finally {
      setSubmitting(false)
    }
  }

  const totalUsers = users.length
  const withTest = users.filter((user) => Boolean(user.test && user.test.trim())).length
  const createdToday = users.filter((user) => {
    if (!user.created_at) return false
    return new Date(user.created_at).toDateString() === new Date().toDateString()
  }).length

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Admin</h1>
          <p className="text-sm text-muted-foreground">
            Manage superadmins from{" "}
            <span className="font-mono">{`${schemaName ?? "seung_control"}.${tableName ?? "superadmin"}`}</span>.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void refreshUsers(true)} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Refresh</span>
          </Button>
          <Button
            onClick={() => {
              resetForm()
              setCreateOpen(true)
            }}
          >
            <Plus className="h-4 w-4" />
            <span className="ml-2">Add User</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUsers}</div>
            <p className="text-xs text-muted-foreground">Rows in the active control schema</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Schema</CardTitle>
            <Badge variant="secondary">{schemaName ?? "seung_control"}</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{schemaName ?? "seung_control"}</div>
            <p className="text-xs text-muted-foreground">Source schema for admin login users</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">With Test Value</CardTitle>
            <KeyRound className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{withTest}</div>
            <p className="text-xs text-muted-foreground">Rows where the `test` column is populated</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Created Today</CardTitle>
            <Plus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{createdToday}</div>
            <p className="text-xs text-muted-foreground">Based on `created_at`</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Superadmin Users</CardTitle>
          <CardDescription>
            Search, create, edit, and delete rows from the active control schema.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by email"
            className="max-w-sm"
          />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Password</TableHead>
                <TableHead>Test</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead className="w-[160px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No users found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => {
                  const isCurrentUser = currentUserEmail === user.email.toLowerCase()
                  return (
                    <TableRow
                      key={user.id}
                      className={cn(
                        isCurrentUser &&
                          "bg-emerald-50/80 hover:bg-emerald-50 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/30"
                      )}
                    >
                      <TableCell className="align-top">{user.id}</TableCell>
                      <TableCell className="align-top">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{user.email}</span>
                          {isCurrentUser ? <Badge className="bg-emerald-600 text-white">Current</Badge> : null}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant="outline">
                          {user.has_password ? "Configured" : "Not set"}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top text-muted-foreground">
                        {user.test || "—"}
                      </TableCell>
                      <TableCell className="align-top text-muted-foreground">
                        {user.created_at ? new Date(user.created_at).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(user)}>
                            <Pencil className="h-4 w-4" />
                            <span className="ml-2">Edit</span>
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => openDelete(user)}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="ml-2">Delete</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Superadmin</DialogTitle>
            <DialogDescription>
              Create a new row in `{`${schemaName ?? "seung_control"}.${tableName ?? "superadmin"}`}`.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="create-email">Email</Label>
              <Input
                id="create-email"
                value={form.email}
                onChange={(e) => setForm((cur) => ({ ...cur, email: e.target.value }))}
                placeholder="admin@example.com"
                autoComplete="email"
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-password">Password</Label>
              <Input
                id="create-password"
                type="password"
                value={form.password}
                onChange={(e) => setForm((cur) => ({ ...cur, password: e.target.value }))}
                autoComplete="new-password"
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-test">Test</Label>
              <Input
                id="create-test"
                value={form.test}
                onChange={(e) => setForm((cur) => ({ ...cur, test: e.target.value }))}
                placeholder="Optional note"
                disabled={submitting}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateOpen(false)
                resetForm()
              }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleCreate()} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span className="ml-2">{submitting ? "Creating..." : "Create Superadmin"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Superadmin</DialogTitle>
            <DialogDescription>
              Update the selected row from `{`${schemaName ?? "seung_control"}.${tableName ?? "superadmin"}`}`.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-id">ID</Label>
              <Input id="edit-id" value={selectedUser?.id ?? ""} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                value={form.email}
                onChange={(e) => setForm((cur) => ({ ...cur, email: e.target.value }))}
                autoComplete="email"
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-password">New Password</Label>
              <Input
                id="edit-password"
                type="password"
                value={form.password}
                onChange={(e) => setForm((cur) => ({ ...cur, password: e.target.value }))}
                placeholder="Leave blank to keep the current password"
                autoComplete="new-password"
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-test">Test</Label>
              <Input
                id="edit-test"
                value={form.test}
                onChange={(e) => setForm((cur) => ({ ...cur, test: e.target.value }))}
                placeholder="Optional note"
                disabled={submitting}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditOpen(false)
                resetForm()
              }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleUpdate()} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
              <span className="ml-2">{submitting ? "Saving..." : "Save Superadmin"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Superadmin</DialogTitle>
            <DialogDescription>
              This will permanently remove <span className="font-mono">{selectedUser?.email}</span> from
              `{`${schemaName ?? "seung_control"}.${tableName ?? "superadmin"}`}`.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteOpen(false)
                resetForm()
              }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              <span className="ml-2">{submitting ? "Deleting..." : "Delete Superadmin"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}