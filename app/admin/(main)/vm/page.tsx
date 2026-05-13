"use client"

import { useEffect, useState } from "react"
import {
  Database,
  Server,
  RefreshCw,
  Plus,
  Eye,
  Cpu,
  HardDrive,
  User,
  Info,
  Terminal,
  KeyRound,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
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
import { toast } from "sonner"

type VMData = {
  success: boolean
  vmDisplayName?: string
  db: {
    host: string
    port: string
    database: string
    user: string
    envHost?: string
    envPort?: string
    pgVersion: string
    dbSize: string
    activeConnections: number
  }
}

/** Matches `/api/vm?action=vminfo` payload (PostgreSQL-visible server metadata). */
type VMInfoRecord = Record<string, string | number | string[] | undefined | null>

type TableInfo = {
  table_name: string
  table_schema: string
}

type ColumnSchema = {
  column_name: string
  data_type: string
  is_nullable: string
  column_default: string | null
}

type DatabaseUser = {
  username: string
  is_superuser: boolean
  can_create_db: boolean
  valid_until: string | null
}

type TableStat = {
  schemaname: string
  tablename: string
  live_rows: string
  dead_rows: string
  last_vacuum: string
  last_autovacuum: string
  last_analyze: string
  last_autoanalyze: string
}

function displayValue(v: string | number | string[] | undefined | null) {
  if (v === null || v === undefined || v === "") return "—"
  if (Array.isArray(v)) return v.join(", ")
  return String(v)
}

const VM_DETAIL_ROWS: { key: string; label: string }[] = [
  { key: "vmDisplayName", label: "Display name (local to this app)" },
  { key: "hostnameLabel", label: "Connection target (host:port)" },
  { key: "connectionHost", label: "Host (app connection)" },
  { key: "connectionPort", label: "Port (app connection)" },
  { key: "connectionDatabase", label: "Database (from DATABASE_URL)" },
  { key: "connectionUser", label: "User (from DATABASE_URL)" },
  { key: "serverIP", label: "Server bind address (inet_server_addr)" },
  { key: "serverPort", label: "Server port (inet_server_port)" },
  { key: "currentUser", label: "current_user" },
  { key: "sessionUser", label: "session_user" },
  { key: "serverVersion", label: "PostgreSQL server_version" },
  { key: "platformSummary", label: "Version (first line)" },
  { key: "dataDirectory", label: "Data directory" },
  { key: "maxConnections", label: "max_connections" },
  { key: "sharedBuffers", label: "shared_buffers" },
  { key: "serverStartTime", label: "Postmaster start time" },
  { key: "serverUptime", label: "Postmaster uptime" },
  { key: "currentDbSize", label: "Current database size" },
  { key: "totalDatabaseSize", label: "All databases (total size)" },
  { key: "databaseCount", label: "Non-template database count" },
  { key: "activeConnections", label: "Active queries (state = active)" },
]

export default function VMPage() {
  const [data, setData] = useState<VMData | null>(null)
  const [vmInfo, setVmInfo] = useState<VMInfoRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [tables, setTables] = useState<TableInfo[]>([])
  const [users, setUsers] = useState<DatabaseUser[]>([])
  const [stats, setStats] = useState<TableStat[]>([])
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [tableSchema, setTableSchema] = useState<ColumnSchema[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [activeTab, setActiveTab] = useState<
    "overview" | "tables" | "users" | "statistics"
  >("overview")
  const [newTableName, setNewTableName] = useState("")
  const [newColumns, setNewColumns] = useState([
    { name: "", type: "VARCHAR(255)", constraints: "" },
  ])

  const [passwordDialogUser, setPasswordDialogUser] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState("")
  const [passwordSaving, setPasswordSaving] = useState(false)

  const [showCreateUser, setShowCreateUser] = useState(false)
  const [createUsername, setCreateUsername] = useState("")
  const [createPassword, setCreatePassword] = useState("")
  const [createSuper, setCreateSuper] = useState(false)
  const [createDb, setCreateDb] = useState(false)
  const [createUserSaving, setCreateUserSaving] = useState(false)

  const [displayNameInput, setDisplayNameInput] = useState("")
  const [displayNameSaving, setDisplayNameSaving] = useState(false)
  const [hostInput, setHostInput] = useState("")
  const [portInput, setPortInput] = useState("")
  const [hostPortSaving, setHostPortSaving] = useState(false)
  const [connUserPassword, setConnUserPassword] = useState("")
  const [connUserPasswordSaving, setConnUserPasswordSaving] = useState(false)

  const fetchVM = async () => {
    try {
      const res = await fetch("/api/vm?action=info")
      const json = await res.json()
      setData(json)
      if (json.success && typeof json.vmDisplayName === "string") {
        setDisplayNameInput(json.vmDisplayName)
      }
      if (json.success && json.db) {
        setHostInput(String(json.db.host ?? ""))
        setPortInput(String(json.db.port ?? ""))
      }
    } catch (err) {
      console.error("Failed to fetch VM:", err)
    }
  }

  const fetchVMInfo = async () => {
    try {
      const res = await fetch("/api/vm?action=vminfo")
      const json = await res.json()
      if (json.success && json.vmInfo) {
        setVmInfo(json.vmInfo as VMInfoRecord)
      } else {
        setVmInfo(null)
      }
    } catch (err) {
      console.error("Failed to fetch VM info:", err)
      setVmInfo(null)
    }
  }

  const fetchTables = async () => {
    try {
      const res = await fetch("/api/vm?action=tables")
      const json = await res.json()
      if (json.success) {
        setTables(json.tables)
      }
    } catch (err) {
      console.error("Failed to fetch tables:", err)
    }
  }

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/vm?action=users")
      const json = await res.json()
      if (json.success) {
        setUsers(json.users)
      }
    } catch (err) {
      console.error("Failed to fetch users:", err)
    }
  }

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/vm?action=stats")
      const json = await res.json()
      if (json.success) {
        setStats(json.stats)
      }
    } catch (err) {
      console.error("Failed to fetch stats:", err)
    }
  }

  const fetchTableSchema = async (tableName: string) => {
    try {
      const res = await fetch(`/api/vm?action=schema&table=${tableName}`)
      const json = await res.json()
      if (json.success) {
        setTableSchema(json.schema)
      }
    } catch (err) {
      console.error("Failed to fetch schema:", err)
    }
  }

  const createTable = async () => {
    if (!newTableName || newColumns.some((col) => !col.name)) {
      toast.error("Fill in the table name and every column name.")
      return
    }

    try {
      const res = await fetch("/api/vm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createTable",
          tableName: newTableName,
          columns: newColumns,
        }),
      })

      const json = await res.json()
      if (json.success) {
        toast.success(`Table '${newTableName}' created.`)
        setShowCreateModal(false)
        setNewTableName("")
        setNewColumns([{ name: "", type: "VARCHAR(255)", constraints: "" }])
        fetchTables()
      } else {
        toast.error(json.error || "Create failed")
      }
    } catch (err) {
      console.error("Failed to create table:", err)
      toast.error("Failed to create table")
    }
  }

  const submitHostPort = async () => {
    setHostPortSaving(true)
    try {
      const res = await fetch("/api/vm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setVmHostPort",
          host: hostInput,
          port: portInput,
        }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success(json.message || "Connection updated")
        await Promise.all([
          fetchVM(),
          fetchVMInfo(),
          fetchTables(),
          fetchUsers(),
          fetchStats(),
        ])
      } else {
        toast.error(json.error || "Could not save host/port")
      }
    } catch (e) {
      toast.error(String(e))
    } finally {
      setHostPortSaving(false)
    }
  }

  const submitConnUserPassword = async () => {
    if (!data?.db.user) return
    if (!connUserPassword) {
      toast.error("Enter a new password.")
      return
    }
    setConnUserPasswordSaving(true)
    try {
      const res = await fetch("/api/vm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setUserPassword",
          username: data.db.user,
          password: connUserPassword,
        }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success(json.message || "Password updated on the server.")
        setConnUserPassword("")
        toast.info(
          "If this app uses DATABASE_URL for the password, update that value (or redeploy secrets) to match, then restart."
        )
      } else {
        toast.error(json.error || "Could not update password")
      }
    } catch (e) {
      toast.error(String(e))
    } finally {
      setConnUserPasswordSaving(false)
    }
  }

  const submitDisplayName = async () => {
    setDisplayNameSaving(true)
    try {
      const res = await fetch("/api/vm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setVmDisplayName",
          displayName: displayNameInput,
        }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success(json.message || "Saved")
        await Promise.all([fetchVM(), fetchVMInfo()])
      } else {
        toast.error(json.error || "Could not save name")
      }
    } catch (e) {
      toast.error(String(e))
    } finally {
      setDisplayNameSaving(false)
    }
  }

  const submitPasswordChange = async () => {
    if (!passwordDialogUser || !newPassword) {
      toast.error("Enter a new password.")
      return
    }
    setPasswordSaving(true)
    try {
      const res = await fetch("/api/vm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setUserPassword",
          username: passwordDialogUser,
          password: newPassword,
        }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success(json.message || "Password updated")
        setPasswordDialogUser(null)
        setNewPassword("")
        fetchUsers()
      } else {
        toast.error(json.error || "Could not update password")
      }
    } catch (e) {
      toast.error(String(e))
    } finally {
      setPasswordSaving(false)
    }
  }

  const submitCreateUser = async () => {
    if (!createUsername || !createPassword) {
      toast.error("Username and password are required.")
      return
    }
    setCreateUserSaving(true)
    try {
      const res = await fetch("/api/vm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createUser",
          username: createUsername,
          password: createPassword,
          superuser: createSuper,
          canCreateDb: createDb,
        }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success(json.message || "User created")
        setShowCreateUser(false)
        setCreateUsername("")
        setCreatePassword("")
        setCreateSuper(false)
        setCreateDb(false)
        fetchUsers()
      } else {
        toast.error(json.error || "Could not create user")
      }
    } catch (e) {
      toast.error(String(e))
    } finally {
      setCreateUserSaving(false)
    }
  }

  const addColumn = () => {
    setNewColumns([...newColumns, { name: "", type: "VARCHAR(255)", constraints: "" }])
  }
  const [isHostSectionOpen, setIsHostSectionOpen] = useState(false) // Default open
  const [isPasswordSectionOpen, setIsPasswordSectionOpen] = useState(false) // Default closed

  const removeColumn = (index: number) => {
    setNewColumns(newColumns.filter((_, i) => i !== index))
  }

  const updateColumn = (index: number, field: string, value: string) => {
    const updated = [...newColumns]
    updated[index] = { ...updated[index], [field]: value }
    setNewColumns(updated)
  }

  const handleTableClick = async (tableName: string) => {
    setSelectedTable(tableName)
    await fetchTableSchema(tableName)
  }

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await Promise.all([
        fetchVM(),
        fetchVMInfo(),
        fetchTables(),
        fetchUsers(),
        fetchStats(),
      ])
      setLoading(false)
    }
    loadData()
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    await Promise.all([
      fetchVM(),
      fetchVMInfo(),
      fetchTables(),
      fetchUsers(),
      fetchStats(),
    ])
    setRefreshing(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-sm text-muted-foreground">Loading database information...</div>
      </div>
    )
  }

  if (!data?.success) {
    return (
      <div className="p-6">
        <div className="text-red-500 text-sm">Failed to load database info</div>
      </div>
    )
  }

  const fmtTs = (v: string | null) => {
    if (!v) return "—"
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString()
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-4 md:px-6 md:py-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <Server className="h-5 w-5" />
            {data.vmDisplayName?.trim()
              ? data.vmDisplayName.trim()
              : "VM & Database Dashboard"}
          </h1>
          <p className="text-sm text-muted-foreground">
            PostgreSQL server details from your connection, tables, roles, and statistics. Host
            CPU and RAM are not visible over SQL alone; configuration and storage metrics are shown
            below.
          </p>
        </div>

        <Button
          onClick={handleRefresh}
          variant="outline"
          className="gap-2"
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

     

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
        className="gap-4"
      >
        <TabsList variant="line" className="w-full flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Users & roles</TabsTrigger>
          <TabsTrigger value="statistics">Statistics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-6">
          {vmInfo?.error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {String(vmInfo.error)}
            </div>
          )}

          {vmInfo && (
            <div className="border rounded-xl p-6 shadow-sm bg-white">
              <div className="flex items-center gap-2 mb-4">
                <Terminal className="h-4 w-4" />
                <h2 className="text-sm font-semibold">PostgreSQL server details</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {VM_DETAIL_ROWS.map(({ key, label }) => (
                  <div key={key} className="flex items-start gap-2 min-w-0">
                    <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">{label}</div>
                      <div className="text-sm font-medium break-words">
                        {displayValue(vmInfo[key] as string | number | string[] | undefined | null)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {vmInfo.physicalHostNote && (
                <p className="mt-4 text-xs text-muted-foreground flex gap-2 items-start">
                  <Cpu className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{String(vmInfo.physicalHostNote)}</span>
                </p>
              )}

              {Array.isArray(vmInfo.databases) && vmInfo.databases.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
                    <HardDrive className="h-4 w-4" />
                    Databases (non-template)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {vmInfo.databases.map((name) => (
                      <span
                        key={name}
                        className="text-xs font-mono rounded-md border bg-muted/40 px-2 py-1"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {vmInfo.postgresVersion && (
                <div className="mt-4 pt-4 border-t">
                  <div className="text-xs text-muted-foreground mb-2">Full version()</div>
                  <pre className="text-xs bg-muted/50 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {String(vmInfo.postgresVersion)}
                  </pre>
                </div>
              )}
            </div>
          )}

          <div className="border rounded-xl p-6 shadow-sm bg-white">
            <div className="flex items-center gap-2 mb-4">
              <Database className="h-4 w-4" />
              <h2 className="text-sm font-semibold">Database connection (from app)</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-muted-foreground">Host</div>
                <div className="text-sm font-mono">
                  {data.db.host}:{data.db.port}
                </div>
              </div>

              <div>
                <div className="text-xs text-muted-foreground">Database name</div>
                <div className="text-sm font-mono">{data.db.database}</div>
              </div>

              <div>
                <div className="text-xs text-muted-foreground">Database user</div>
                <div className="text-sm font-mono">{data.db.user}</div>
              </div>

              <div>
                <div className="text-xs text-muted-foreground">PostgreSQL version</div>
                <div className="text-sm font-mono break-all">{data.db.pgVersion?.split("\n")[0]}</div>
              </div>

              <div>
                <div className="text-xs text-muted-foreground">Database size</div>
                <div className="text-sm">{data.db.dbSize}</div>
              </div>

              <div>
                <div className="text-xs text-muted-foreground">Connections to this database</div>
                <div className="text-sm">{data.db.activeConnections}</div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="border rounded-xl shadow-sm bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => setIsHostSectionOpen(!isHostSectionOpen)}
                className="w-full flex items-center justify-between p-6 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  <h2 className="text-sm font-semibold">Hostname, port, and label</h2>
                </div>
                {isHostSectionOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              {isHostSectionOpen && (
                <div className="px-6 pb-6 pt-0 space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Host and port override the server address from{" "}
                    <code className="rounded bg-muted px-1">DATABASE_URL</code> for this app only
                    (saved in{" "}
                    <code className="rounded bg-muted px-1">.powerbase/vm-settings.json</code>
                    ). Database name, user, and password still come from{" "}
                    <code className="rounded bg-muted px-1">DATABASE_URL</code>. Set host and port to
                    match your env values to clear overrides.
                  </p>
                  {data.db.envHost != null && data.db.envPort != null && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">DATABASE_URL</span> host:{" "}
                      <span className="font-mono">
                        {data.db.envHost}:{data.db.envPort}
                      </span>
                    </p>
                  )}
                  {data.db.envHost != null &&
                    data.db.envPort != null &&
                    (data.db.host !== data.db.envHost || data.db.port !== data.db.envPort) && (
                      <p className="text-xs rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                        Overrides active: env is{" "}
                        <span className="font-mono">
                          {data.db.envHost}:{data.db.envPort}
                        </span>
                      </p>
                    )}
                  <div className="space-y-2">
                    <Label htmlFor="vm-host">PostgreSQL hostname or IP</Label>
                    <Input
                      id="vm-host"
                      value={hostInput}
                      onChange={(e) => setHostInput(e.target.value)}
                      placeholder="e.g. db.example.com or 127.0.0.1"
                      autoComplete="off"
                      maxLength={255}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vm-port">Port</Label>
                    <Input
                      id="vm-port"
                      value={portInput}
                      onChange={(e) => setPortInput(e.target.value)}
                      placeholder="5432"
                      inputMode="numeric"
                      maxLength={5}
                    />
                  </div>
                  <Button
                    onClick={submitHostPort}
                    disabled={hostPortSaving}
                    className="w-full sm:w-auto"
                  >
                    {hostPortSaving ? "Saving…" : "Save host and port"}
                  </Button>

                  <div className="border-t pt-4 space-y-2">
                    <Label htmlFor="vm-display-name">Display name (optional)</Label>
                    <p className="text-xs text-muted-foreground">
                      Shown in the page title only; does not change PostgreSQL.
                    </p>
                    <Input
                      id="vm-display-name"
                      value={displayNameInput}
                      onChange={(e) => setDisplayNameInput(e.target.value)}
                      placeholder="e.g. Production Postgres"
                      maxLength={128}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={submitDisplayName}
                      disabled={displayNameSaving}
                      className="w-full sm:w-auto"
                    >
                      {displayNameSaving ? "Saving…" : "Save display name"}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="border rounded-xl shadow-sm bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => setIsPasswordSectionOpen(!isPasswordSectionOpen)}
                className="w-full flex items-center justify-between p-6 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4" />
                  <h2 className="text-sm font-semibold">PostgreSQL login password</h2>
                </div>
                {isPasswordSectionOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              {isPasswordSectionOpen && (
                <div className="px-6 pb-6 pt-0 space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Runs <code className="rounded bg-muted px-1">ALTER ROLE … PASSWORD</code> for
                    role <span className="font-mono">{data.db.user}</span> (the user in{" "}
                    <code className="rounded bg-muted px-1">DATABASE_URL</code>). The app still
                    authenticates with the password in that URL until you update it there (or in
                    your host&apos;s secret store) and restart.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="conn-user-pw">New password</Label>
                    <Input
                      id="conn-user-pw"
                      type="password"
                      autoComplete="new-password"
                      value={connUserPassword}
                      onChange={(e) => setConnUserPassword(e.target.value)}
                    />
                  </div>
                  <Button onClick={submitConnUserPassword} disabled={connUserPasswordSaving}>
                    {connUserPasswordSaving ? "Updating…" : "Update password on server"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="users" className="flex flex-col gap-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowCreateUser(true)} className="gap-2">
              <User className="h-4 w-4" />
              New login role
            </Button>
          </div>

          <div className="border rounded-xl bg-white shadow-sm overflow-x-auto">
            <UITable>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>Superuser</TableHead>
                  <TableHead>Create DB</TableHead>
                  <TableHead>Valid until</TableHead>
                  <TableHead className="w-[140px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.username}>
                    <TableCell className="font-mono text-sm">{u.username}</TableCell>
                    <TableCell>{u.is_superuser ? "Yes" : "No"}</TableCell>
                    <TableCell>{u.can_create_db ? "Yes" : "No"}</TableCell>
                    <TableCell className="text-xs">{fmtTs(u.valid_until)}</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => {
                          setPasswordDialogUser(u.username)
                          setNewPassword("")
                        }}
                      >
                        <KeyRound className="h-4 w-4" />
                        Password
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </UITable>
          </div>

          <p className="text-xs text-muted-foreground">
            Changing passwords runs <code className="rounded bg-muted px-1">ALTER ROLE … PASSWORD</code>{" "}
            on the server. Your app connection user must have permission (often a superuser).
            Role names are restricted to letters, numbers, and underscore.
          </p>
          

          <Dialog
            open={passwordDialogUser !== null}
            onOpenChange={(o) => {
              if (!o) {
                setPasswordDialogUser(null)
                setNewPassword("")
              }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Set password for {passwordDialogUser}</DialogTitle>
                <DialogDescription>
                  This updates the PostgreSQL role password on the database server.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 py-2">
                <Label htmlFor="npw">New password</Label>
                <Input
                  id="npw"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setPasswordDialogUser(null)
                    setNewPassword("")
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={submitPasswordChange} disabled={passwordSaving}>
                  {passwordSaving ? "Saving…" : "Update password"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={showCreateUser} onOpenChange={setShowCreateUser}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New login role</DialogTitle>
                <DialogDescription>
                  Creates a role with LOGIN (and optional SUPERUSER / CREATEDB). Same naming rules as
                  above.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="cnu">Role name</Label>
                  <Input
                    id="cnu"
                    value={createUsername}
                    onChange={(e) => setCreateUsername(e.target.value)}
                    placeholder="app_reader"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cnp">Password</Label>
                  <Input
                    id="cnp"
                    type="password"
                    autoComplete="new-password"
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="csu"
                    checked={createSuper}
                    onCheckedChange={(v) => setCreateSuper(v === true)}
                  />
                  <Label htmlFor="csu" className="font-normal cursor-pointer">
                    SUPERUSER
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="cdb"
                    checked={createDb}
                    onCheckedChange={(v) => setCreateDb(v === true)}
                  />
                  <Label htmlFor="cdb" className="font-normal cursor-pointer">
                    CREATEDB
                  </Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateUser(false)}>
                  Cancel
                </Button>
                <Button onClick={submitCreateUser} disabled={createUserSaving}>
                  {createUserSaving ? "Creating…" : "Create role"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="statistics" className="flex flex-col gap-4">
          <div className="border rounded-xl bg-white shadow-sm overflow-x-auto">
            <UITable>
              <TableHeader>
                <TableRow>
                  <TableHead>Schema</TableHead>
                  <TableHead>Table</TableHead>
                  <TableHead className="text-right">Live rows</TableHead>
                  <TableHead className="text-right">Dead rows</TableHead>
                  <TableHead>Last vacuum</TableHead>
                  <TableHead>Last analyze</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.map((s) => (
                  <TableRow key={`${s.schemaname}.${s.tablename}`}>
                    <TableCell className="font-mono text-xs">{s.schemaname}</TableCell>
                    <TableCell className="font-mono text-sm">{s.tablename}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.live_rows}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.dead_rows}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{fmtTs(s.last_vacuum)}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {fmtTs(s.last_analyze)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </UITable>
            {stats.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground">No statistics available.</div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
