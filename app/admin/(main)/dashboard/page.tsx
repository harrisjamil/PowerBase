"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  LayoutDashboard,
  RefreshCw,
  Loader2,
  FolderKanban,
  Database,
  Users,
  UserRound,
  HardDrive,
  Library,
  Server,
  Layers3,
  Network,
  Terminal,
  Settings2,
  ArrowRight,
  Activity,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import type {
  AdminDashboardPayload,
  AdminDashboardProject,
  AdminDashboardTeam,
} from "@/lib/admin-dashboard"

type DashboardResponse = {
  success: boolean
  dashboard?: AdminDashboardPayload
  adminEmail?: string
  error?: string
}

const quickLinks = [
  { title: "VM Overview", href: "/admin/vm", icon: Server, description: "Database host, size, and stats" },
  { title: "Projects", href: "/admin/vm/projects", icon: FolderKanban, description: "VM projects and schemas" },
  { title: "Schemas", href: "/admin/schemas", icon: Database, description: "Browse tables and columns" },
  { title: "Visualizer", href: "/admin/schemas/visualizer", icon: Network, description: "ER diagrams and relationships" },
  { title: "Teams", href: "/admin/team", icon: Users, description: "Members and project access" },
  { title: "Data Library", href: "/admin/data-library", icon: Library, description: "Exports, docs, and API refs" },
  { title: "DB Users", href: "/admin/admin", icon: UserRound, description: "PostgreSQL login roles" },
  { title: "Terminal", href: "/admin/vm/terminal", icon: Terminal, description: "SSH into the VM" },
  { title: "Settings", href: "/admin/settings", icon: Settings2, description: "Platform configuration" },
]

function getDisplayName(email: string) {
  const [name] = email.split("@")
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : email
}

function formatDate(value: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "active":
      return "bg-green-100 text-green-800"
    case "archived":
      return "bg-gray-100 text-gray-700"
    case "draft":
      return "bg-amber-100 text-amber-800"
    default:
      return "bg-muted text-muted-foreground"
  }
}

export default function DashboardPage() {
  const [data, setData] = useState<AdminDashboardPayload | null>(null)
  const [adminEmail, setAdminEmail] = useState("")
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadDashboard = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/dashboard")
      const result = (await response.json()) as DashboardResponse

      if (!response.ok || !result.success || !result.dashboard) {
        throw new Error(result.error || "Failed to load dashboard")
      }

      setData(result.dashboard)
      setAdminEmail(result.adminEmail ?? "")
    } catch (error) {
      console.error("Dashboard load error:", error)
      toast.error(error instanceof Error ? error.message : "Failed to load dashboard")
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      await loadDashboard()
      setLoading(false)
    }
    void init()
  }, [loadDashboard])

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadDashboard()
    setRefreshing(false)
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">Could not load dashboard data.</p>
      </div>
    )
  }

  const { stats, vm, recentProjects, recentTeams, topSchemas, topTables } = data

  return (
    <div className="flex flex-col gap-6 px-4 py-4 md:gap-8 md:px-6 md:py-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <LayoutDashboard className="h-6 w-6" />
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Welcome back{adminEmail ? `, ${getDisplayName(adminEmail)}` : ""}. Overview of your PowerBuddy workspace.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="VM Projects"
          value={stats.projects}
          hint={`${stats.activeProjects} active`}
          icon={FolderKanban}
        />
        <StatCard label="Schemas" value={stats.schemas} hint={`${stats.totalTables} tables`} icon={Database} />
        <StatCard label="Teams" value={stats.teams} hint="With project access" icon={Users} />
        <StatCard label="DB Users" value={stats.dbUsers} hint="Managed logins" icon={UserRound} />
        <StatCard label="Library" value={stats.libraryAssets} hint="Catalog entries" icon={Library} />
        <StatCard
          label="Database"
          value={stats.dbSizePretty}
          hint={`${stats.activeConnections} connections`}
          icon={HardDrive}
          valueClassName="text-xl"
        />
      </div>

      {/* Quick links */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Quick access</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardContent className="flex items-start gap-3 p-4">
                  <link.icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{link.title}</p>
                    <p className="text-xs text-muted-foreground">{link.description}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* VM + Agents row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="h-4 w-4" />
              {vm.displayName}
            </CardTitle>
            <CardDescription>Connected PostgreSQL instance</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            <InfoRow label="Host" value={`${vm.host}:${vm.port}`} />
            <InfoRow label="Database" value={vm.database} />
            <InfoRow label="Version" value={vm.pgVersion} />
            <InfoRow label="Control schema" value={vm.controlSchema} />
            <InfoRow label="Size" value={stats.dbSizePretty} />
            <InfoRow label="Active connections" value={String(stats.activeConnections)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" />
              Platform summary
            </CardTitle>
            <CardDescription>PowerBuddy control-plane counts</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            <InfoRow label="Agents" value={String(stats.agents)} />
            <InfoRow label="Teams" value={String(stats.teams)} />
            <InfoRow label="DB users" value={String(stats.dbUsers)} />
            <InfoRow label="Library assets" value={String(stats.libraryAssets)} />
            <InfoRow label="Projects" value={`${stats.activeProjects} / ${stats.projects}`} />
            <InfoRow label="User schemas" value={String(stats.schemas)} />
          </CardContent>
        </Card>
      </div>

      {/* Projects + Teams */}
      <div className="grid gap-4 xl:grid-cols-2">
        <ProjectsSection projects={recentProjects} />
        <TeamsSection teams={recentTeams} />
      </div>

      {/* Schemas + Tables */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Largest schemas</CardTitle>
              <CardDescription>By on-disk size</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/schemas">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Schema</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Tables</TableHead>
                  <TableHead>Size</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topSchemas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No schemas found
                    </TableCell>
                  </TableRow>
                ) : (
                  topSchemas.map((schema) => (
                    <TableRow key={schema.schemaName} className="hover:bg-muted/30">
                      <TableCell>
                        <Link
                          href={`/admin/schemas/${encodeURIComponent(schema.schemaName)}`}
                          className="font-medium hover:underline"
                        >
                          {schema.schemaName}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {schema.projectName ?? "—"}
                      </TableCell>
                      <TableCell>{schema.tableCount}</TableCell>
                      <TableCell>{schema.totalSize}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Busiest tables</CardTitle>
              <CardDescription>By live row count</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/vm">VM stats</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Table</TableHead>
                  <TableHead>Schema</TableHead>
                  <TableHead className="text-right">Live rows</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topTables.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      No table statistics yet
                    </TableCell>
                  </TableRow>
                ) : (
                  topTables.map((table) => (
                    <TableRow
                      key={`${table.schemaName}.${table.tableName}`}
                      className="hover:bg-muted/30"
                    >
                      <TableCell className="font-medium">{table.tableName}</TableCell>
                      <TableCell className="text-muted-foreground">{table.schemaName}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {table.liveRows.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  valueClassName = "text-2xl",
}: {
  label: string
  value: string | number
  hint: string
  icon: React.ComponentType<{ className?: string }>
  valueClassName?: string
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription>{label}</CardDescription>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <CardTitle className={`font-semibold tabular-nums ${valueClassName}`}>{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-dashed py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right font-medium">{value}</span>
    </div>
  )
}

function ProjectsSection({ projects }: { projects: AdminDashboardProject[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderKanban className="h-4 w-4" />
            Recent projects
          </CardTitle>
          <CardDescription>Latest VM projects</CardDescription>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/vm/projects">View all</Link>
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Schema</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  <div className="py-4 text-center">
                    <p className="mb-2">No projects yet</p>
                    <Button size="sm" asChild>
                      <Link href="/admin/vm/projects/new">Create project</Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              projects.map((project) => (
                <TableRow key={project.id} className="hover:bg-muted/30">
                  <TableCell className="font-medium">{project.name}</TableCell>
                  <TableCell className="font-mono text-xs">{project.schemaName}</TableCell>
                  <TableCell>
                    <Badge className={statusBadgeClass(project.status)}>{project.status}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(project.updatedAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function TeamsSection({ teams }: { teams: AdminDashboardTeam[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers3 className="h-4 w-4" />
            Teams
          </CardTitle>
          <CardDescription>Collaboration groups</CardDescription>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/team">Manage</Link>
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Team</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>Privacy</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teams.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  <div className="py-4 text-center">
                    <p className="mb-2">No teams yet</p>
                    <Button size="sm" asChild>
                      <Link href="/admin/team">Create team</Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              teams.map((team) => (
                <TableRow key={team.id} className="hover:bg-muted/30">
                  <TableCell>
                    <Link href={`/admin/team/${team.id}`} className="font-medium hover:underline">
                      {team.name}
                    </Link>
                  </TableCell>
                  <TableCell>{team.memberCount}</TableCell>
                  <TableCell className="capitalize">{team.privacy}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(team.updatedAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
