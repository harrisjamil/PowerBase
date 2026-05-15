"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  Trash2,
  UserCog,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { DeleteConfirmationDialog } from "@/components/agents/delete-confirmation-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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

type PgUser = {
  oid: number
  username: string
  can_login: boolean
  is_superuser: boolean
  can_create_db: boolean
  can_create_role: boolean
  inherits: boolean
  bypass_rls: boolean
  is_system_role: boolean
  is_admin: boolean
  granted_schemas: string[]
}

type DbUsersResponse = {
  success: boolean
  users?: PgUser[]
  schemas?: string[]
  count?: number
  error?: string
}

type DbUserMutationResponse = {
  success?: boolean
  error?: string
  user?: PgUser
}

type DbUserFormState = {
  username: string
  password: string
  canLogin: boolean
  isAdmin: boolean
  isSuperuser: boolean
  canCreateDb: boolean
  canCreateRole: boolean
  schemaNames: string[]
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
  }
  if (typeof value !== "string") {
    return []
  }

  const trimmed = value.trim()
  if (!trimmed || trimmed === "{}") {
    return []
  }
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return [trimmed]
}

function normalizeUser(user: PgUser): PgUser {
  return {
    ...user,
    granted_schemas: normalizeStringArray((user as PgUser & { granted_schemas?: unknown }).granted_schemas),
  }
}

const EMPTY_FORM: DbUserFormState = {
  username: "",
  password: "",
  canLogin: true,
  isAdmin: false,
  isSuperuser: false,
  canCreateDb: false,
  canCreateRole: false,
  schemaNames: [],
}

export default function AdminPage() {
  const [users, setUsers] = useState<PgUser[]>([])
  const [schemas, setSchemas] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [formOpen, setFormOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<PgUser | null>(null)
  const [form, setForm] = useState<DbUserFormState>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)

  const requestUsers = async (): Promise<DbUsersResponse> => {
    const res = await fetch("/api/db-users")
    const data = (await res.json()) as DbUsersResponse
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Failed to fetch PostgreSQL users")
    }
    return data
  }

  const applyPageData = (data: DbUsersResponse) => {
    setUsers((data.users ?? []).map(normalizeUser))
    setSchemas(data.schemas ?? [])
  }

  const refreshPage = async (showRefreshing = false) => {
    if (showRefreshing) {
      setRefreshing(true)
    }

    try {
      const data = await requestUsers()
      applyPageData(data)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to refresh PostgreSQL users")
    } finally {
      if (showRefreshing) {
        setRefreshing(false)
      }
    }
  }

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const data = await requestUsers()
        if (!cancelled) {
          applyPageData(data)
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Failed to fetch PostgreSQL users")
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
    const query = searchTerm.trim().toLowerCase()
    if (!query) return users
    return users.filter(
      (user) =>
        user.username.toLowerCase().includes(query) ||
        user.granted_schemas.some((schemaName) =>
          schemaName.toLowerCase().includes(query)
        )
    )
  }, [searchTerm, users])

  const selectedSchemaNames = useMemo(() => new Set(form.schemaNames), [form.schemaNames])

  const closeForm = () => {
    setFormOpen(false)
    setSelectedUser(null)
    setForm(EMPTY_FORM)
  }

  const openCreateDialog = () => {
    setSelectedUser(null)
    setForm(EMPTY_FORM)
    setFormOpen(true)
  }

  const openEditDialog = (user: PgUser) => {
    setSelectedUser(user)
    setForm({
      username: user.username,
      password: "",
      canLogin: user.can_login,
      isAdmin: user.is_admin,
      isSuperuser: user.is_superuser,
      canCreateDb: user.can_create_db,
      canCreateRole: user.can_create_role,
      schemaNames: user.granted_schemas ?? [],
    })
    setFormOpen(true)
  }

  const openDeleteDialog = (user: PgUser) => {
    setSelectedUser(user)
    setDeleteOpen(true)
  }

  const toggleSchema = (schemaName: string, checked: boolean) => {
    setForm((current) => {
      const next = new Set(current.schemaNames)
      if (checked) {
        next.add(schemaName)
      } else {
        next.delete(schemaName)
      }
      return {
        ...current,
        schemaNames: Array.from(next).sort((left, right) => left.localeCompare(right)),
      }
    })
  }

  const handleSave = async () => {
    const username = form.username.trim()
    if (!username) {
      toast.error("Username is required.")
      return
    }
    if (!selectedUser && !form.password) {
      toast.error("Password is required when creating a PostgreSQL role.")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/db-users", {
        method: selectedUser ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oid: selectedUser?.oid,
          username,
          password: form.password,
          can_login: form.canLogin,
          is_admin: form.isAdmin,
          is_superuser: form.isSuperuser,
          can_create_db: form.canCreateDb,
          can_create_role: form.canCreateRole,
          schema_names: form.schemaNames,
        }),
      })
      const data = (await res.json()) as DbUserMutationResponse
      if (!res.ok || !data.success) {
        throw new Error(
          data.error || `Failed to ${selectedUser ? "update" : "create"} PostgreSQL role`
        )
      }

      toast.success(
        selectedUser
          ? `PostgreSQL role ${username} updated.`
          : `PostgreSQL role ${username} created successfully.`
      )
      closeForm()
      await refreshPage()
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Failed to ${selectedUser ? "update" : "create"} PostgreSQL role`
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedUser) return

    setSubmitting(true)
    try {
      const res = await fetch(
        `/api/db-users?oid=${encodeURIComponent(String(selectedUser.oid))}`,
        { method: "DELETE" }
      )
      const data = (await res.json()) as { success?: boolean; error?: string }
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete PostgreSQL role")
      }

      toast.success(`PostgreSQL role ${selectedUser.username} deleted.`)
      setDeleteOpen(false)
      setSelectedUser(null)
      await refreshPage()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete PostgreSQL role")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">PostgreSQL Users</h1>
          <p className="text-sm text-muted-foreground">
            View all PostgreSQL roles, create new ones, edit existing ones, manage
            schema permissions, and flag roles for admin login access.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => void refreshPage(true)}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">Refresh</span>
          </Button>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4" />
            <span className="ml-2">Add PostgreSQL Role</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">All Roles</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
            <p className="text-xs text-muted-foreground">Includes built-in and custom PostgreSQL roles</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Login Roles</CardTitle>
            <UserCog className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.filter((user) => user.can_login).length}
            </div>
            <p className="text-xs text-muted-foreground">Roles with LOGIN enabled</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Admin Roles</CardTitle>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.filter((user) => user.is_admin).length}
            </div>
            <p className="text-xs text-muted-foreground">Can sign in to `/admin/login`</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Roles</CardTitle>
            <ShieldX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.filter((user) => user.is_system_role).length}
            </div>
            <p className="text-xs text-muted-foreground">Built-in roles like `postgres` and `pg_*`</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>DB Users</CardTitle>
          <CardDescription>
            This screen reads directly from PostgreSQL roles, not from the old control schema.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search by role name or schema"
            className="max-w-sm"
          />

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>OID</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Flags</TableHead>
                  <TableHead>Schemas</TableHead>
                  <TableHead className="w-[180px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No PostgreSQL roles found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.oid}>
                      <TableCell className="align-top">{user.oid}</TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-col gap-1">
                          <code className="rounded bg-muted px-2 py-1 text-xs w-fit">
                            {user.username}
                          </code>
                          {user.can_login ? (
                            <Badge variant="secondary" className="w-fit">LOGIN</Badge>
                          ) : (
                            <Badge variant="outline" className="w-fit">NOLOGIN</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant={user.is_system_role ? "outline" : "secondary"}>
                          {user.is_system_role ? "System" : "Custom"}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant={user.is_admin ? "secondary" : "outline"}>
                          {user.is_admin ? "Admin" : "User"}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-wrap gap-1">
                          {user.is_superuser ? <Badge variant="outline">SUPERUSER</Badge> : null}
                          {user.can_create_db ? <Badge variant="outline">CREATEDB</Badge> : null}
                          {user.can_create_role ? <Badge variant="outline">CREATEROLE</Badge> : null}
                          {!user.is_superuser && !user.can_create_db && !user.can_create_role ? (
                            <span className="text-sm text-muted-foreground">Basic</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-wrap gap-1">
                          {user.granted_schemas.length === 0 ? (
                            <span className="text-sm text-muted-foreground">No schema grants</span>
                          ) : (
                            <>
                              {user.granted_schemas.slice(0, 2).map((schemaName) => (
                                <Badge key={schemaName} variant="outline">
                                  {schemaName}
                                </Badge>
                              ))}
                              {user.granted_schemas.length > 2 ? (
                                <Badge variant="secondary">
                                  +{user.granted_schemas.length - 2}
                                </Badge>
                              ) : null}
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditDialog(user)}
                          >
                            <Pencil className="h-4 w-4" />
                            <span className="ml-2">Edit</span>
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => openDeleteDialog(user)}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="ml-2">Delete</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeForm()
            return
          }
          setFormOpen(true)
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedUser ? "Edit PostgreSQL Role" : "Create PostgreSQL Role"}
            </DialogTitle>
            <DialogDescription>
              Manage the PostgreSQL role itself, its admin access, and direct schema permissions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {selectedUser ? (
              <div className="space-y-2">
                <Label htmlFor="role-oid">OID</Label>
                <Input id="role-oid" value={String(selectedUser.oid)} disabled className="bg-muted" />
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="role-name">Role Name</Label>
                <Input
                  id="role-name"
                  value={form.username}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, username: event.target.value }))
                  }
                  placeholder="powerbase_user"
                  autoComplete="username"
                  disabled={submitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role-password">
                  {selectedUser ? "New Password" : "Password"}
                </Label>
                <Input
                  id="role-password"
                  type="password"
                  value={form.password}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, password: event.target.value }))
                  }
                  placeholder={
                    selectedUser
                      ? "Leave blank to keep the current password"
                      : "Set PostgreSQL password"
                  }
                  autoComplete="new-password"
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-start gap-3 rounded-2xl border p-3">
                <Checkbox
                  checked={form.canLogin}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({ ...current, canLogin: checked === true }))
                  }
                  disabled={submitting}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-medium">Allow Login</div>
                  <div className="text-sm text-muted-foreground">
                    Enables the role to authenticate with a password.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-2xl border p-3">
                <Checkbox
                  checked={form.isAdmin}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({ ...current, isAdmin: checked === true }))
                  }
                  disabled={submitting}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-medium">Admin Access</div>
                  <div className="text-sm text-muted-foreground">
                    Allows the role to sign in through `/admin/login`.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-2xl border p-3">
                <Checkbox
                  checked={form.isSuperuser}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({ ...current, isSuperuser: checked === true }))
                  }
                  disabled={submitting}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-medium">Superuser</div>
                  <div className="text-sm text-muted-foreground">
                    Grants PostgreSQL SUPERUSER capability.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-2xl border p-3">
                <Checkbox
                  checked={form.canCreateDb}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({ ...current, canCreateDb: checked === true }))
                  }
                  disabled={submitting}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-medium">Create DB</div>
                  <div className="text-sm text-muted-foreground">
                    Grants PostgreSQL CREATEDB capability.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-2xl border p-3 md:col-span-2">
                <Checkbox
                  checked={form.canCreateRole}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({ ...current, canCreateRole: checked === true }))
                  }
                  disabled={submitting}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-medium">Create Role</div>
                  <div className="text-sm text-muted-foreground">
                    Grants PostgreSQL CREATEROLE capability.
                  </div>
                </div>
              </label>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Schema Permissions</Label>
                <p className="text-sm text-muted-foreground">
                  Selected schemas receive direct usage and table CRUD grants from the server.
                </p>
              </div>

              <div className="rounded-xl border p-3">
                {schemas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No grantable schemas were found.
                  </p>
                ) : (
                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {schemas.map((schemaName) => (
                      <label
                        key={schemaName}
                        htmlFor={`schema-${schemaName}`}
                        className="flex cursor-pointer items-start gap-3 rounded-2xl border p-3"
                      >
                        <Checkbox
                          id={`schema-${schemaName}`}
                          checked={selectedSchemaNames.has(schemaName)}
                          onCheckedChange={(checked) =>
                            toggleSchema(schemaName, checked === true)
                          }
                          disabled={submitting}
                          className="mt-0.5"
                        />
                        <div>
                          <div className="font-medium">{schemaName}</div>
                          <div className="text-sm text-muted-foreground">
                            Grant schema usage plus table and sequence access.
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeForm} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : selectedUser ? (
                <Pencil className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              <span className="ml-2">
                {submitting
                  ? selectedUser
                    ? "Saving..."
                    : "Creating..."
                  : selectedUser
                    ? "Save Role"
                    : "Create Role"}
              </span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmationDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open)
          if (!open) {
            setSelectedUser(null)
          }
        }}
        onConfirm={handleDelete}
        title="Delete PostgreSQL Role"
        description="This will drop the PostgreSQL role. Built-in and system roles may fail if PostgreSQL rejects the operation."
        itemName={selectedUser?.username}
        confirming={submitting}
      />
    </div>
  )
}
