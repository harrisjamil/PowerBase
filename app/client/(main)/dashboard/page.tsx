"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePeriodicCallback } from "@/hooks/use-periodic-callback";
import {
  ArrowUpDown,
  Database,
  FolderKanban,
  HardDrive,
  Layers3,
  PauseCircle,
  RefreshCw,
  Search,
  Shield,
  Users,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ProjectStatus = "active" | "paused" | "archived" | "provisioning" | "unknown";

type Project = {
  id: number;
  name: string;
  schema_name: string;
  owner: string | null;
  table_count: number;
  total_size: string;
  description: string | null;
  creator_role_name: string | null;
  assigned_role_names: string[];
  assigned_role_count: number;
  status: string;
  created_at: string | null;
  updated_at: string | null;
  access_via_individual?: boolean;
  access_via_team?: boolean;
  team_names?: string[];
};

type ProjectsResponse = {
  success: boolean;
  projects?: Project[];
  error?: string;
};

type SortOption = "name" | "schema_name" | "owner" | "status" | "table_count";

function normalizeStatus(status: string | null | undefined): ProjectStatus {
  const value = status?.trim().toLowerCase();
  if (value === "active" || value === "paused" || value === "archived" || value === "provisioning") {
    return value;
  }
  return "unknown";
}

function getStatusText(status: string | null | undefined) {
  const normalized = normalizeStatus(status);
  if (normalized === "unknown") {
    return status?.trim() || "Unknown";
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatUpdatedAt(value: string | null) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function ClientDashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const loadProjects = useCallback(async (options?: { refresh?: boolean; silent?: boolean }) => {
    if (options?.refresh && !options?.silent) {
      setRefreshing(true);
    } else if (!options?.silent) {
      setLoading(true);
    }

    setError(null);

    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      const result = (await response.json()) as ProjectsResponse;

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to load projects");
      }

      setProjects(result.projects ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load projects");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadInitialProjects = async () => {
      try {
        const response = await fetch("/api/projects", { cache: "no-store" });
        const result = (await response.json()) as ProjectsResponse;

        if (cancelled) {
          return;
        }

        if (!response.ok || !result.success) {
          throw new Error(result.error || "Failed to load projects");
        }

        setProjects(result.projects ?? []);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load projects");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadInitialProjects();

    return () => {
      cancelled = true;
    };
  }, []);

  usePeriodicCallback(() => {
    void loadProjects({ silent: true });
  }, 5_000);

  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let filtered = [...projects];

    if (query) {
      filtered = filtered.filter((project) =>
        [
          project.name,
          project.schema_name,
          project.owner ?? "",
          project.description ?? "",
          project.creator_role_name ?? "",
          ...project.assigned_role_names,
        ].some((value) => value.toLowerCase().includes(query))
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((project) => normalizeStatus(project.status) === statusFilter);
    }

    filtered.sort((left, right) => {
      if (sortBy === "status") {
        const order: Record<ProjectStatus, number> = {
          active: 1,
          provisioning: 2,
          paused: 3,
          archived: 4,
          unknown: 5,
        };
        const leftValue = order[normalizeStatus(left.status)];
        const rightValue = order[normalizeStatus(right.status)];
        return sortOrder === "asc" ? leftValue - rightValue : rightValue - leftValue;
      }

      if (sortBy === "table_count") {
        return sortOrder === "asc"
          ? left.table_count - right.table_count
          : right.table_count - left.table_count;
      }

      const leftValue =
        (sortBy === "owner" ? left.owner : left[sortBy])?.toString().toLowerCase() ?? "";
      const rightValue =
        (sortBy === "owner" ? right.owner : right[sortBy])?.toString().toLowerCase() ?? "";

      if (leftValue < rightValue) return sortOrder === "asc" ? -1 : 1;
      if (leftValue > rightValue) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [projects, searchQuery, sortBy, sortOrder, statusFilter]);

  const stats = useMemo(
    () => ({
      total: projects.length,
      active: projects.filter((project) => normalizeStatus(project.status) === "active").length,
      paused: projects.filter((project) => normalizeStatus(project.status) === "paused").length,
      totalTables: projects.reduce((sum, project) => sum + Number(project.table_count || 0), 0),
    }),
    [projects]
  );

  const getStatusIcon = (status: string) => {
    switch (normalizeStatus(status)) {
      case "active":
        return <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />;
      case "paused":
        return <PauseCircle className="h-4 w-4 text-amber-500" />;
      case "provisioning":
        return <ProvisioningStatusIcon />;
      case "archived":
        return <div className="h-2 w-2 rounded-full bg-slate-400" />;
      default:
        return <DefaultStatusIcon />;
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 py-10">
        <div className="text-sm text-muted-foreground">Loading your assigned projects...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <DashboardIntro />
          <Button
            variant="outline"
            onClick={() => void loadProjects({ refresh: true })}
            className="gap-2"
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <DashboardStats stats={stats} />

        <Card className="border-0 bg-white/80 shadow-sm backdrop-blur-sm">
          <CardContent className="p-4">
            <DashboardFilters
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              sortBy={sortBy}
              onSortByChange={setSortBy}
              sortOrder={sortOrder}
              onSortOrderToggle={() =>
                setSortOrder((current) => (current === "asc" ? "desc" : "asc"))
              }
            />
          </CardContent>
        </Card>

        {error && projects.length === 0 ? (
          <Card className="border border-red-200 bg-red-50 shadow-sm">
            <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <p className="text-sm font-medium text-red-700">{error}</p>
              <Button variant="outline" onClick={() => void loadProjects()}>
                Try again
              </Button>
            </CardContent>
          </Card>
        ) : (
          <ProjectGrid
            filteredProjects={filteredProjects}
            projects={projects}
            onClearFilters={() => {
              setSearchQuery("");
              setStatusFilter("all");
            }}
            onOpenProject={(id: number) => router.push(`/client/projects/${id}`)}
            getStatusIcon={getStatusIcon}
            getStatusText={getStatusText}
            formatUpdatedAt={formatUpdatedAt}
          />
        )}

        <DashboardFooter
          filteredCount={filteredProjects.length}
          activeCount={stats.active}
          pausedCount={stats.paused}
        />
      </div>
    </div>
  );
}

function ProvisioningStatusIcon() {
  return <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />;
}

function DefaultStatusIcon() {
  return <div className="h-2 w-2 rounded-full bg-gray-400" />;
}

function DashboardIntro() {
  return (
    <div>
      <p className="text-sm text-muted-foreground">
        Real projects your admin assigned to this database user.
      </p>
    </div>
  );
}

function DashboardToolbar({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function DashboardStats({ stats }: { stats: { total: number; active: number; paused: number; totalTables: number } }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Assigned projects</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <span className="text-2xl font-bold">{stats.total}</span>
          <FolderKanban className="h-5 w-5 text-muted-foreground" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Active</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <span className="text-2xl font-bold">{stats.active}</span>
          <div className="h-3 w-3 rounded-full bg-emerald-500" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Paused</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <span className="text-2xl font-bold">{stats.paused}</span>
          <PauseCircle className="h-5 w-5 text-amber-500" />
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
  );
}

function DashboardFilters({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sortBy,
  onSortByChange,
  sortOrder,
  onSortOrderToggle,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  sortBy: SortOption;
  onSortByChange: (value: SortOption) => void;
  sortOrder: "asc" | "desc";
  onSortOrderToggle: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Search by project, schema, owner, or role"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          className="border-gray-200 bg-gray-50/50 pl-9 transition-colors focus:bg-white"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={onStatusFilterChange}>
          <SelectTrigger className="w-[150px] border-gray-200 bg-gray-50/50 hover:bg-gray-100">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="provisioning">Provisioning</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1">
          <Select value={sortBy} onValueChange={(value) => onSortByChange(value as SortOption)}>
            <SelectTrigger className="w-[170px] border-gray-200 bg-gray-50/50 hover:bg-gray-100">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Sort by name</SelectItem>
              <SelectItem value="schema_name">Sort by schema</SelectItem>
              <SelectItem value="owner">Sort by owner</SelectItem>
              <SelectItem value="status">Sort by status</SelectItem>
              <SelectItem value="table_count">Sort by tables</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            onClick={onSortOrderToggle}
            className="h-9 w-9 border border-gray-200 bg-gray-50/50 hover:bg-gray-100"
          >
            <ArrowUpDown className="h-3.5 w-3.5 text-gray-500" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProjectGrid({
  filteredProjects,
  projects,
  onClearFilters,
  onOpenProject,
  getStatusIcon,
  getStatusText,
  formatUpdatedAt,
}: {
  filteredProjects: Project[];
  projects: Project[];
  onClearFilters: () => void;
  onOpenProject: (id: number) => void;
  getStatusIcon: (status: string) => React.ReactNode;
  getStatusText: (status: string | null | undefined) => string;
  formatUpdatedAt: (value: string | null) => string;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {filteredProjects.length === 0 ? (
        <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <Search className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900">
            {projects.length === 0 ? "No assigned projects yet" : "No matching projects found"}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {projects.length === 0
              ? "Ask your admin to assign a project directly or add you as a team admin."
              : "Try adjusting your search or filter."}
          </p>
          {projects.length > 0 ? (
            <Button variant="link" onClick={onClearFilters} className="mt-2">
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : (
        filteredProjects.map((project) => (
          <Card
            key={project.id}
            onClick={() => onOpenProject(project.id)}
            className={`cursor-pointer overflow-hidden border transition-all duration-200 hover:border-gray-300 hover:shadow-md ${
              normalizeStatus(project.status) === "paused" ? "bg-gray-50/60" : "bg-white"
            }`}
          >
            <CardContent className="p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 shadow-inner">
                    <Database className="h-5 w-5 text-gray-600" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold leading-tight text-gray-900">{project.name}</h3>
                      {project.access_via_team ? (
                        <Badge className="gap-1 border-purple-200 bg-purple-50 text-[10px] font-medium text-purple-700">
                          <Users className="h-3 w-3" />
                          {project.team_names && project.team_names.length > 0
                            ? `Team: ${project.team_names.join(", ")}`
                            : "Team assigned"}
                        </Badge>
                      ) : project.access_via_individual ? (
                        <Badge className="gap-1 border-blue-200 bg-blue-50 text-[10px] font-medium text-blue-700">
                          Direct access
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 font-mono text-xs text-gray-500">{project.schema_name}</p>
                  </div>
                </div>
                <StatusRow status={project.status} getStatusIcon={getStatusIcon} getStatusText={getStatusText} />
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                <Badge variant="outline" className="gap-1 text-[11px]">
                  <Layers3 className="h-3 w-3" />
                  {project.table_count} table{project.table_count === 1 ? "" : "s"}
                </Badge>
                <Badge variant="outline" className="gap-1 text-[11px]">
                  <HardDrive className="h-3 w-3" />
                  {project.total_size}
                </Badge>
                {project.owner ? (
                  <Badge variant="outline" className="gap-1 text-[11px]">
                    <Shield className="h-3 w-3" />
                    {project.owner}
                  </Badge>
                ) : null}
              </div>

              <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3">
                <p className="text-sm text-gray-700">
                  {project.description?.trim() || "No description was added for this project."}
                </p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-gray-100 p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                    Created by role
                  </p>
                  <p className="mt-1 text-sm font-medium text-gray-800">
                    {project.creator_role_name || "Unknown"}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-100 p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                    Assigned roles
                  </p>
                  <p className="mt-1 text-sm font-medium text-gray-800">{project.assigned_role_count}</p>
                </div>
              </div>

              {project.assigned_role_names.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {project.assigned_role_names.slice(0, 4).map((roleName) => (
                    <Badge key={roleName} variant="secondary" className="text-[11px]">
                      {roleName}
                    </Badge>
                  ))}
                  {project.assigned_role_names.length > 4 ? (
                    <Badge variant="secondary" className="text-[11px]">
                      +{project.assigned_role_names.length - 4} more
                    </Badge>
                  ) : null}
                </div>
              ) : null}

              <UpdatedAt updatedAt={formatUpdatedAt(project.updated_at)} />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function StatusRow({
  status,
  getStatusIcon,
  getStatusText,
}: {
  status: string;
  getStatusIcon: (status: string) => React.ReactNode;
  getStatusText: (status: string | null | undefined) => string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {getStatusIcon(status)}
      <span className="text-xs text-gray-500">{getStatusText(status)}</span>
    </div>
  );
}

function UpdatedAt({ updatedAt }: { updatedAt: string }) {
  return (
    <div className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-400">
      Last updated {updatedAt}
    </div>
  );
}

function DashboardFooter({
  filteredCount,
  activeCount,
  pausedCount,
}: {
  filteredCount: number;
  activeCount: number;
  pausedCount: number;
}) {
  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-gray-100 pt-2 pb-4 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-4">
        <span>
          {filteredCount} visible project{filteredCount === 1 ? "" : "s"}
        </span>
        <span className="flex items-center gap-1">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {activeCount} active
        </span>
        <span className="flex items-center gap-1">
          <PauseCircle className="h-3 w-3 text-amber-500" />
          {pausedCount} paused
        </span>
      </div>
      <div className="text-xs text-gray-400">
        Data is loaded from your live PowerBase project assignments
      </div>
    </div>
  );
}
