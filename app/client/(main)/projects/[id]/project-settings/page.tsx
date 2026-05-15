"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiKeysSettings } from "./components/api-keys-settings";
import {
  AlertCircle,
  Check,
  ChevronsUpDown,
  Database,
  Key,
  Loader2,
  Save,
  Shield,
  Trash2,
  UserPlus,
  CreditCard,
  Plug,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import IntegrationsSettings from "./components/integrations-settings";
const SETTINGS_TABS = ["general", "api-keys", "integrations"] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];

function isSettingsTab(value: string | null): value is SettingsTab {
  return SETTINGS_TABS.includes(value as SettingsTab);
}

type ProjectDetail = {
  id: number;
  project_ref: string;
  name: string;
  schema_name: string;
  description: string | null;
  status: string;
  created_at: string | null;
  updated_at: string | null;
  creator_role_name: string | null;
  owner: string | null;
  table_count: number;
  total_size: string;
  assigned_role_names: string[];
  assigned_role_count: number;
  can_manage: boolean;
  is_creator: boolean;
  current_role_name: string;
};

type AssignableRole = {
  oid: number;
  username: string;
  can_login: boolean;
  is_system_role: boolean;
};

type ProjectAccessEntry = {
  roleName: string;
  isCreator: boolean;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatDate(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getRoleInitials(roleName: string) {
  const parts = roleName.split(/[@._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return roleName.slice(0, 2).toUpperCase();
}

function buildAccessEntries(project: ProjectDetail): ProjectAccessEntry[] {
  const entries = new Map<string, ProjectAccessEntry>();

  if (project.creator_role_name) {
    entries.set(project.creator_role_name.toLowerCase(), {
      roleName: project.creator_role_name,
      isCreator: true,
    });
  }

  for (const roleName of project.assigned_role_names) {
    const key = roleName.toLowerCase();
    if (!entries.has(key)) {
      entries.set(key, { roleName, isCreator: false });
    }
  }

  return Array.from(entries.values()).sort((left, right) => {
    if (left.isCreator !== right.isCreator) {
      return left.isCreator ? -1 : 1;
    }
    return left.roleName.localeCompare(right.roleName);
  });
}

function ProjectSettingsPageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = params?.id as string;

  const tabFromUrl = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<SettingsTab>(() =>
    isSettingsTab(tabFromUrl) ? tabFromUrl : "general"
  );

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [isDirty, setIsDirty] = useState(false);

  const [assignableRoles, setAssignableRoles] = useState<AssignableRole[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const [selectedRoleName, setSelectedRoleName] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [roleToRemove, setRoleToRemove] = useState<ProjectAccessEntry | null>(null);
  const [removingMember, setRemovingMember] = useState(false);

  const accessEntries = useMemo(
    () => (project ? buildAccessEntries(project) : []),
    [project]
  );

  const assignedRoleSet = useMemo(() => {
    if (!project) return new Set<string>();
    return new Set(
      [
        ...(project.creator_role_name ? [project.creator_role_name] : []),
        ...project.assigned_role_names,
      ].map((role) => role.toLowerCase())
    );
  }, [project]);

  const availableRoles = useMemo(
    () =>
      assignableRoles.filter(
        (role) => !assignedRoleSet.has(role.username.toLowerCase())
      ),
    [assignableRoles, assignedRoleSet]
  );

  const loadProject = useCallback(async () => {
    if (!projectId) return;

    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/projects/${projectId}?lite=1`);
      const data = (await response.json()) as {
        success: boolean;
        project?: ProjectDetail;
        error?: string;
      };

      if (!response.ok || !data.success || !data.project) {
        throw new Error(data.error || "Failed to load project settings");
      }

      const loaded = {
        ...data.project,
        assigned_role_names: data.project.assigned_role_names ?? [],
      };
      setProject(loaded);
      setProjectName(loaded.name);
      setDescription(loaded.description ?? "");
      setIsDirty(false);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load project settings"));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const loadAssignableRoles = useCallback(async () => {
    if (!projectId || !project?.can_manage) return;

    try {
      setLoadingRoles(true);
      const response = await fetch(`/api/projects/${projectId}/assignable-roles`);
      const data = (await response.json()) as {
        success: boolean;
        roles?: AssignableRole[];
        error?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load assignable roles");
      }

      setAssignableRoles(data.roles ?? []);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to load assignable roles"));
    } finally {
      setLoadingRoles(false);
    }
  }, [project?.can_manage, projectId]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  useEffect(() => {
    if (project?.can_manage) {
      void loadAssignableRoles();
    }
  }, [loadAssignableRoles, project?.can_manage]);

  const patchProject = async (body: Record<string, unknown>) => {
    const response = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as {
      success: boolean;
      error?: string;
    };

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to update project");
    }

    const refresh = await fetch(`/api/projects/${projectId}?lite=1`);
    const refreshed = (await refresh.json()) as {
      success: boolean;
      project?: ProjectDetail;
      error?: string;
    };

    if (!refresh.ok || !refreshed.success || !refreshed.project) {
      throw new Error(refreshed.error || "Failed to refresh project");
    }

    return refreshed.project;
  };

  const handleSaveSettings = async () => {
    if (!project) return;

    setSaving(true);
    try {
      const updated = await patchProject({
        name: projectName.trim(),
        description: description.trim() || null,
      });

      setProject(updated);
      setProjectName(updated.name);
      setDescription(updated.description ?? "");
      setIsDirty(false);
      toast.success("Project settings saved");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save settings"));
    } finally {
      setSaving(false);
    }
  };

  const handleAddMember = async () => {
    if (!project || !selectedRoleName) {
      toast.error("Select a PostgreSQL user to add");
      return;
    }

    setAddingMember(true);
    try {
      const nextAssigned = Array.from(
        new Set([...project.assigned_role_names, selectedRoleName])
      ).sort((left, right) => left.localeCompare(right));

      const updated = await patchProject({ assigned_role_names: nextAssigned });
      setProject(updated);
      toast.success(`${selectedRoleName} now has access to this project`);
      setIsAddMemberOpen(false);
      setSelectedRoleName("");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to add user"));
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!project || !roleToRemove || roleToRemove.isCreator) return;

    setRemovingMember(true);
    try {
      const nextAssigned = project.assigned_role_names.filter(
        (role) => role.toLowerCase() !== roleToRemove.roleName.toLowerCase()
      );

      const updated = await patchProject({ assigned_role_names: nextAssigned });
      setProject(updated);
      toast.success(`${roleToRemove.roleName} has been removed from this project`);
      setRoleToRemove(null);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to remove user"));
    } finally {
      setRemovingMember(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!project) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as {
        success: boolean;
        error?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to delete project");
      }

      toast.success("Project deleted");
      router.push("/client/dashboard");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to delete project"));
    } finally {
      setDeleting(false);
    }
  };

  const handleTabChange = (value: string) => {
    if (!isSettingsTab(value)) return;

    setActiveTab(value);

    const basePath = `/client/projects/${projectId}/project-settings`;
    const nextUrl = value === "general" ? basePath : `${basePath}?tab=${value}`;
    router.replace(nextUrl, { scroll: false });
  };

  if (loading) {
    return (
      <div className="container mx-auto max-w-4xl py-6">
        <div className="flex h-full min-h-[60vh] items-center justify-center">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading project settings...
          </div>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return <ErrorState error={error} onRetry={loadProject} />;
  }

  const canManage = project.can_manage;

  return (
    <div className="container mx-auto max-w-4xl space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Project Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage project details, access controls, and API integrations
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 lg:w-auto">
          <TabsTrigger value="general" className="gap-2">
            <Shield className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="api-keys" className="gap-2">
            <Key className="h-4 w-4" />
            API Keys
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-2">
            <Plug className="h-4 w-4" />
            Integrations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
  {!canManage && (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
      You have read-only access. Only the project creator (
      <span className="font-medium">{project.creator_role_name ?? "unknown"}</span>
      ) can change settings.
    </div>
  )}

  <Card>
    <CardHeader>
      <CardTitle>General settings</CardTitle>
      <CardDescription>
        Basic project information stored in PowerBase
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-6">
      {/* Project Name - Horizontal */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="sm:w-1/3">
          <Label htmlFor="project-name">Project name</Label>
          <p className="text-xs text-muted-foreground mt-1">
            Displayed throughout the dashboard.
          </p>
        </div>
        <div className="sm:w-2/3">
          <Input
            id="project-name"
            value={projectName}
            onChange={(e) => {
              setProjectName(e.target.value);
              setIsDirty(true);
            }}
            placeholder="Enter project name"
            disabled={!canManage}
          />
        </div>
      </div>

      {/* Project ID - Horizontal */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="sm:w-1/3">
          <Label>Project ID</Label>
          <p className="text-xs text-muted-foreground mt-1">
            Reference used in APIs and URLs.
          </p>
        </div>
        <div className="sm:w-2/3">
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              {project.project_ref}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(project.project_ref);
                toast.success("Project ID copied");
              }}
            >
              Copy
            </Button>
          </div>
        </div>
      </div>

      {/* Schema Name - Horizontal */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="sm:w-1/3">
          <Label>Schema name</Label>
          <p className="text-xs text-muted-foreground mt-1">
            PostgreSQL schema backing this project.
          </p>
        </div>
        <div className="sm:w-2/3">
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              {project.schema_name}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(project.schema_name);
                toast.success("Schema name copied");
              }}
            >
              Copy
            </Button>
          </div>
        </div>
      </div>

      {/* Description - Horizontal */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="sm:w-1/3">
          <Label htmlFor="description">Description</Label>
          <p className="text-xs text-muted-foreground mt-1">
            Optional notes about this project.
          </p>
        </div>
        <div className="sm:w-2/3">
          <Textarea
            id="description"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setIsDirty(true);
            }}
            placeholder="Describe this project"
            className="resize-none"
            rows={3}
            disabled={!canManage}
          />
        </div>
      </div>

      <Separator />

      {/* Stats Grid - Keep as is or make horizontal */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Status" value={project.status} badge />
        <Stat label="Tables" value={String(project.table_count)} />
        <Stat label="Storage" value={project.total_size} />
        <Stat label="Owner" value={project.owner ?? "—"} />
        <Stat label="Created" value={formatDate(project.created_at)} />
        <Stat label="Updated" value={formatDate(project.updated_at)} />
      </div>

      {/* Save Button - Right aligned */}
      {isDirty && canManage && (
        <div className="flex justify-end pt-4">
          <Button onClick={() => void handleSaveSettings()} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save changes
              </>
            )}
          </Button>
        </div>
      )}
    </CardContent>
  </Card>

  {/* Project Access Card - Keep as is or make horizontal */}
  <Card>
    <CardHeader className="flex flex-row items-center justify-between gap-4">
      <div>
        <CardTitle>Project access</CardTitle>
        <CardDescription>
          PostgreSQL users who can access this project schema
        </CardDescription>
      </div>
      {canManage && (
        <Button
          size="sm"
          onClick={() => {
            setIsAddMemberOpen(true);
            void loadAssignableRoles();
          }}
          disabled={loadingRoles}
        >
          <UserPlus className="mr-2 h-4 w-4" />
          Add user
        </Button>
      )}
    </CardHeader>
    <CardContent>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Shield className="h-4 w-4" />
        <span>
          Creator:{" "}
          <span className="font-medium text-foreground">
            {project.creator_role_name ?? "—"}
          </span>
          {project.is_creator ? " (you)" : ""}
        </span>
        <span className="text-muted-foreground/50">·</span>
        <Database className="inline h-4 w-4" />
        <span>{accessEntries.length} users with access</span>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Access</TableHead>
              {canManage && <TableHead className="w-[80px]" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {accessEntries.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canManage ? 3 : 2}
                  className="py-8 text-center text-muted-foreground"
                >
                  No users are assigned to this project
                </TableCell>
              </TableRow>
            ) : (
              accessEntries.map((entry) => (
                <TableRow key={entry.roleName}>
                  <TableCell>
                    <MemberCell roleName={entry.roleName} />
                  </TableCell>
                  <TableCell>
                    <Badge variant={entry.isCreator ? "default" : "secondary"}>
                      {entry.isCreator ? "Creator" : "Assigned"}
                    </Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      {!entry.isCreator && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRoleToRemove(entry)}
                          className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/20"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </CardContent>
  </Card>

  {/* Danger Zone - Keep as is */}
  {canManage && project.is_creator && (
    <Card className="border-red-200 dark:border-red-900">
      <CardHeader>
        <CardTitle className="text-red-600 dark:text-red-400">Danger zone</CardTitle>
        <CardDescription>
          Permanently delete this project and its metadata
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DangerZone
          projectName={project.name}
          onDelete={() => setShowDeleteDialog(true)}
        />
      </CardContent>
    </Card>
  )}
</TabsContent>

        <TabsContent value="api-keys">
          <ApiKeysSettings />
        </TabsContent>

        <TabsContent value="integrations">
          <IntegrationsSettings/>
        </TabsContent>
      </Tabs>

      {/* Dialogs and AlertDialogs remain the same */}
      <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add PostgreSQL user</DialogTitle>
            <DialogDescription>
              Grant an existing database user access to this project schema.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>User</Label>
            <Popover open={rolePickerOpen} onOpenChange={setRolePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between"
                  disabled={addingMember || loadingRoles}
                >
                  {selectedRoleName || "Select a user..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[var(--radix-popover-trigger-width)] p-0"
                align="start"
              >
                <Command>
                  <CommandInput placeholder="Search users..." />
                  <CommandList>
                    <CommandEmpty>
                      {loadingRoles ? "Loading users..." : "No users available."}
                    </CommandEmpty>
                    <CommandGroup>
                      {availableRoles.map((role) => (
                        <CommandItem
                          key={role.oid}
                          value={role.username}
                          onSelect={() => {
                            setSelectedRoleName(role.username);
                            setRolePickerOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedRoleName === role.username
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                          {role.username}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsAddMemberOpen(false)}
              disabled={addingMember}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleAddMember()}
              disabled={addingMember || !selectedRoleName}
            >
              {addingMember ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add user"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!roleToRemove}
        onOpenChange={(open) => !open && setRoleToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove user access</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <span className="font-medium">{roleToRemove?.roleName}</span> from
              this project? They will lose schema access granted through project
              assignments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removingMember}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleRemoveMember()}
              disabled={removingMember}
              className="bg-red-600 hover:bg-red-700"
            >
              {removingMember ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing...
                </>
              ) : (
                "Remove"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          setShowDeleteDialog(open);
          if (!open) setDeleteConfirmName("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  This will permanently delete the project{" "}
                  <strong>{project.name}</strong> and remove all role assignments. Type
                  the project name to confirm.
                </p>
                <Input
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  placeholder={project.name}
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDeleteProject()}
              disabled={deleting || deleteConfirmName !== project.name}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete project"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Helper Components
function SettingsField({
  id,
  label,
  hint,
  children,
}: {
  id?: string;
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {children}
    </div>
  );
}

function MemberCell({ roleName }: { roleName: string }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-8 w-8">
        <AvatarFallback className="bg-muted text-xs">
          {getRoleInitials(roleName)}
        </AvatarFallback>
      </Avatar>
      <div>
        <p className="text-sm font-medium">{roleName}</p>
        <p className="text-xs text-muted-foreground">PostgreSQL role</p>
      </div>
    </div>
  );
}

function DangerZone({
  projectName,
  onDelete,
}: {
  projectName: string;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-red-200 bg-red-50/50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-red-900 dark:bg-red-950/20">
      <div>
        <p className="font-medium text-red-700 dark:text-red-300">
          Delete &ldquo;{projectName}&rdquo;
        </p>
        <p className="text-sm text-red-600 dark:text-red-400">
          Removes the project record and revokes assigned user access. The PostgreSQL
          schema is not dropped automatically.
        </p>
      </div>
      <Button variant="destructive" size="sm" onClick={onDelete}>
        Delete project
      </Button>
    </div>
  );
}

function Stat({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      {badge ? (
        <Badge variant="secondary" className="mt-1 capitalize">
          {value}
        </Badge>
      ) : (
        <p className="mt-1 text-sm font-medium">{value}</p>
      )}
    </div>
  );
}

function ErrorState({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="container mx-auto max-w-4xl py-6">
      <div className="flex h-full min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-red-500" />
          <p className="mt-2 text-sm font-medium text-red-700">
            {error || "Project not found"}
          </p>
          <Button variant="outline" className="mt-4" onClick={() => void onRetry()}>
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}

function EmptyTabContent({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex min-h-[400px] flex-col items-center justify-center py-12">
        <div className="rounded-full bg-muted p-4 mb-4">{icon}</div>
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground text-center max-w-md">{description}</p>
      </CardContent>
    </Card>
  );
}

export default function ProjectSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto max-w-4xl py-6">
          <div className="flex h-full min-h-[60vh] items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading project settings...
            </div>
          </div>
        </div>
      }
    >
      <ProjectSettingsPageContent />
    </Suspense>
  );
}