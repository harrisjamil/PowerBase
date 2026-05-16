"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
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
import { DeleteConfirmationDialog } from "@/components/agents/delete-confirmation-dialog"
import { toast } from "sonner"
import {
  Users,
  UserPlus,
  Shield,
  Pencil,
  Trash2,
  MoreVertical,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react"

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
    granted_schemas: normalizeStringArray(
      (user as PgUser & { granted_schemas?: unknown }).granted_schemas
    ),
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

const ACCESS_LEVELS = [
  {
    title: "Admin access",
    badge: "Admin",
    badgeVariant: "default" as const,
    description: "Can sign in through /admin/login via the powerbase_admin role.",
    items: ["Manage PostgreSQL roles", "Access admin settings", "Configure security policies"],
  },
  {
    title: "Database login",
    badge: "LOGIN",
    badgeVariant: "secondary" as const,
    description: "PostgreSQL LOGIN privilege — can authenticate with a password.",
    items: ["Connect to the database", "Use assigned schema permissions", "Sign in to client apps"],
  },
  {
    title: "Schema access",
    badge: "Schemas",
    badgeVariant: "outline" as const,
    description: "Direct grants on selected schemas (usage plus table CRUD).",
    items: ["Read and write project data", "Scoped to granted schemas only", "No admin settings access"],
  },
  {
    title: "Elevated PostgreSQL",
    badge: "Elevated",
    badgeVariant: "destructive" as const,
    description: "SUPERUSER, CREATEDB, or CREATEROLE — use sparingly.",
    items: ["Bypass normal permission checks", "Create databases or roles", "Full server-level control when superuser"],
  },
]

export default function UsersPermissionsPage() {
  const [users, setUsers] = useState<PgUser[]>([])
  const [schemas, setSchemas] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<PgUser | null>(null)
  const [form, setForm] = useState<DbUserFormState>(EMPTY_FORM)

  const requestUsers = async (): Promise<DbUsersResponse> => {
    const res = await fetch("/api/db-users")
    const data = (await res.json()) as DbUsersResponse
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Failed to fetch PostgreSQL users")
    }
    return data
  }

  const applyPageData = useCallback((data: DbUsersResponse) => {
    setUsers((data.users ?? []).map(normalizeUser))
    setSchemas(data.schemas ?? [])
  }, [])

  const refreshPage = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) {
      setRefreshing(true)
    }

    try {
      const data = await requestUsers()
      applyPageData(data)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to refresh users")
    } finally {
      if (showRefreshing) {
        setRefreshing(false)
      }
    }
  }, [applyPageData])

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
          toast.error(error instanceof Error ? error.message : "Failed to load users")
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
  }, [applyPageData])

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

  const stats = useMemo(
    () => ({
      total: users.length,
      loginEnabled: users.filter((user) => user.can_login).length,
      adminRoles: users.filter((user) => user.is_admin).length,
      withSchemas: users.filter((user) => user.granted_schemas.length > 0).length,
    }),
    [users]
  )

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
      toast.error("Password is required when creating a user.")
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
          data.error || `Failed to ${selectedUser ? "update" : "create"} user`
        )
      }

      toast.success(
        selectedUser
          ? `User ${username} updated.`
          : `User ${username} created successfully.`
      )
      closeForm()
      await refreshPage()
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Failed to ${selectedUser ? "update" : "create"} user`
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
        throw new Error(data.error || "Failed to delete user")
      }

      toast.success(`User ${selectedUser.username} deleted.`)
      setDeleteOpen(false)
      setSelectedUser(null)
      await refreshPage()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete user")
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggleLogin = async (user: PgUser) => {
    setSubmitting(true)
    try {
      const res = await fetch("/api/db-users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oid: user.oid,
          username: user.username,
          can_login: !user.can_login,
          is_admin: user.is_admin,
          is_superuser: user.is_superuser,
          can_create_db: user.can_create_db,
          can_create_role: user.can_create_role,
          schema_names: user.granted_schemas,
        }),
      })
      const data = (await res.json()) as DbUserMutationResponse
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to update login status")
      }

      toast.success(
        `${user.username} login is now ${user.can_login ? "disabled" : "enabled"}`
      )
      await refreshPage()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update login status")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Users & Permissions</h2>
          <p className="text-sm text-muted-foreground">
            Manage PostgreSQL roles, admin access, and schema permissions
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => void refreshPage(true)}
            disabled={refreshing || submitting}
            className="gap-2"
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>
          <Button onClick={openCreateDialog} className="gap-2" disabled={submitting}>
            <UserPlus className="h-4 w-4" />
            Add User
          </Button>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total roles</CardDescription>
            <CardTitle className="text-2xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Login enabled</CardDescription>
            <CardTitle className="text-2xl">{stats.loginEnabled}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Admin access</CardDescription>
            <CardTitle className="text-2xl">{stats.adminRoles}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>With schema grants</CardDescription>
            <CardTitle className="text-2xl">{stats.withSchemas}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Database Users
          </CardTitle>
          <CardDescription>
            PostgreSQL roles used for admin login, client access, and schema-level permissions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by role or schema"
              className="pl-9"
            />
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Login</TableHead>
                  <TableHead>Capabilities</TableHead>
                  <TableHead>Schemas</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No users found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.oid}>
                      <TableCell className="font-medium">
                        <code className="rounded bg-muted px-2 py-0.5 text-xs">
                          {user.username}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.is_system_role ? "outline" : "secondary"}>
                          {user.is_system_role ? "System" : "Custom"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.is_admin ? "default" : "outline"}>
                          {user.is_admin ? "Yes" : "No"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant={user.can_login ? "secondary" : "outline"}>
                            {user.can_login ? "Enabled" : "Disabled"}
                          </Badge>
                          <Switch
                            checked={user.can_login}
                            onCheckedChange={() => void handleToggleLogin(user)}
                            disabled={submitting || user.is_system_role}
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {user.is_superuser ? (
                            <Badge variant="destructive">SUPERUSER</Badge>
                          ) : null}
                          {user.can_create_db ? (
                            <Badge variant="outline">CREATEDB</Badge>
                          ) : null}
                          {user.can_create_role ? (
                            <Badge variant="outline">CREATEROLE</Badge>
                          ) : null}
                          {!user.is_superuser && !user.can_create_db && !user.can_create_role ? (
                            <span className="text-sm text-muted-foreground">Standard</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {user.granted_schemas.length === 0 ? (
                            <span className="text-sm text-muted-foreground">None</span>
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
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" disabled={submitting}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(user)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => openDeleteDialog(user)}
                              disabled={user.is_system_role}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Access Levels
          </CardTitle>
          <CardDescription>
            How PowerBase maps PostgreSQL roles to application access
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {ACCESS_LEVELS.map((level) => (
              <div
                key={level.title}
                className="rounded-lg border p-4"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{level.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{level.description}</p>
                  </div>
                  <Badge variant={level.badgeVariant}>{level.badge}</Badge>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                  {level.items.map((item) => (
                    <div key={item} className="flex items-center gap-2 text-sm">
                      <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
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
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedUser ? "Edit User" : "Add New User"}</DialogTitle>
            <DialogDescription>
              {selectedUser
                ? "Update role credentials, admin access, and schema permissions."
                : "Create a PostgreSQL role with login credentials and optional schema grants."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="role-name">Role name *</Label>
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
                  {selectedUser ? "New password" : "Password *"}
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
                      ? "Leave blank to keep current password"
                      : "Set PostgreSQL password"
                  }
                  autoComplete="new-password"
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-start gap-3 rounded-lg border p-3">
                <Checkbox
                  checked={form.canLogin}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({ ...current, canLogin: checked === true }))
                  }
                  disabled={submitting}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-medium">Allow login</div>
                  <p className="text-sm text-muted-foreground">
                    Enables password authentication for this role.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-lg border p-3">
                <Checkbox
                  checked={form.isAdmin}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({ ...current, isAdmin: checked === true }))
                  }
                  disabled={submitting}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-medium">Admin access</div>
                  <p className="text-sm text-muted-foreground">
                    Grants membership in powerbase_admin for /admin/login.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-lg border p-3">
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
                  <p className="text-sm text-muted-foreground">
                    Grants PostgreSQL SUPERUSER capability.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-lg border p-3">
                <Checkbox
                  checked={form.canCreateDb}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({ ...current, canCreateDb: checked === true }))
                  }
                  disabled={submitting}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-medium">Create database</div>
                  <p className="text-sm text-muted-foreground">
                    Grants PostgreSQL CREATEDB capability.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-lg border p-3 sm:col-span-2">
                <Checkbox
                  checked={form.canCreateRole}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({ ...current, canCreateRole: checked === true }))
                  }
                  disabled={submitting}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-medium">Create role</div>
                  <p className="text-sm text-muted-foreground">
                    Grants PostgreSQL CREATEROLE capability.
                  </p>
                </div>
              </label>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Schema permissions</Label>
                <p className="text-sm text-muted-foreground">
                  Selected schemas receive usage and table CRUD grants.
                </p>
              </div>
              <div className="rounded-lg border p-3">
                {schemas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No grantable schemas found.</p>
                ) : (
                  <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                    {schemas.map((schemaName) => (
                      <label
                        key={schemaName}
                        htmlFor={`schema-${schemaName}`}
                        className="flex cursor-pointer items-start gap-3 rounded-lg border p-3"
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
                          <p className="text-sm text-muted-foreground">
                            Grant schema usage plus table and sequence access.
                          </p>
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
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : selectedUser ? (
                "Update User"
              ) : (
                "Create User"
              )}
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
        title="Delete User"
        description="This will drop the PostgreSQL role. System roles may fail if PostgreSQL rejects the operation."
        itemName={selectedUser?.username}
        confirming={submitting}
      />
    </div>
  )
}
