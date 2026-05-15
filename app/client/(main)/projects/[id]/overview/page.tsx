"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Database,
  HardDrive,
  Users,
  User,
  Shield,
  Layers,
  Activity,
  Clock,
  Key,
  FileText,
  Settings,
} from "lucide-react";

type ProjectDetail = {
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
};

type ProjectDetailResponse = {
  success: boolean;
  project?: ProjectDetail;
  error?: string;
};

export default function OverviewPage() {
  const params = useParams();
  const projectId = params?.id as string;
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}`);
        const data = (await response.json()) as ProjectDetailResponse;
        if (data.success && data.project) {
          setProject(data.project);
        }
      } catch (error) {
        console.error("Failed to fetch project:", error);
      } finally {
        setLoading(false);
      }
    };

    if (projectId) {
      fetchProject();
    }
  }, [projectId]);

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "active":
        return "bg-emerald-500";
      case "paused":
        return "bg-amber-500";
      case "provisioning":
        return "bg-blue-500";
      case "archived":
        return "bg-gray-400";
      default:
        return "bg-gray-400";
    }
  };

  const getStatusText = (status: string) => {
    return status?.charAt(0).toUpperCase() + status?.slice(1) || "Unknown";
  };

  const formatDate = (date: string | null) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-600" />
          <p className="text-sm text-muted-foreground">Loading project details...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center">
          <p className="text-muted-foreground">Project not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header Section */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            {project.name}
          </h1>
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${getStatusColor(project.status)}`} />
            <span className="text-sm text-muted-foreground">
              {getStatusText(project.status)}
            </span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {project.description || "No description provided for this project."}
        </p>
      </div>

      {/* Main Grid Layout - Similar to Account Settings */}
      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        {/* Sidebar - Project Info Card */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-4">
                <Avatar className="h-24 w-24 bg-gradient-to-br from-blue-500 to-indigo-500">
                  <AvatarFallback className="text-3xl text-white bg-transparent">
                    {project.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="text-center">
                  <h3 className="font-semibold text-lg">{project.name}</h3>
                  <p className="text-sm text-muted-foreground font-mono">
                    {project.schema_name}
                  </p>
                </div>
                <div className="w-full space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant="outline" className="capitalize">
                      {getStatusText(project.status)}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Owner</span>
                    <span className="font-medium">{project.owner || "N/A"}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Created</span>
                    <span className="text-sm">{formatDate(project.created_at)}</span>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="w-full gap-2">
                  <Settings className="h-3.5 w-3.5" />
                  Project Settings
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Quick Stats Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Quick Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Layers className="h-4 w-4" />
                  <span>Tables</span>
                </div>
                <span className="font-semibold">{project.table_count}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <HardDrive className="h-4 w-4" />
                  <span>Total Size</span>
                </div>
                <span className="font-semibold">{project.total_size}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>Assigned Roles</span>
                </div>
                <span className="font-semibold">{project.assigned_role_count}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content - Tabs */}
        <div className="space-y-6">
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
              <TabsTrigger value="overview" className="gap-2">
                <Activity className="h-4 w-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="schemas" className="gap-2">
                <Database className="h-4 w-4" />
                Schemas
              </TabsTrigger>
              <TabsTrigger value="roles" className="gap-2">
                <Shield className="h-4 w-4" />
                Roles
              </TabsTrigger>
              <TabsTrigger value="activity" className="gap-2">
                <Clock className="h-4 w-4" />
                Activity
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview">
              <div className="space-y-6">
                {/* Stats Cards Row */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Total Tables</CardTitle>
                      <Layers className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{project.table_count}</div>
                      <p className="text-xs text-muted-foreground">Tables in schema</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Total Size</CardTitle>
                      <HardDrive className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{project.total_size}</div>
                      <p className="text-xs text-muted-foreground">Storage used</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Assigned Roles</CardTitle>
                      <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{project.assigned_role_count}</div>
                      <p className="text-xs text-muted-foreground">Roles with access</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Owner</CardTitle>
                      <User className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-lg font-bold truncate">
                        {project.owner || "N/A"}
                      </div>
                      <p className="text-xs text-muted-foreground">Project owner</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Project Details Card */}
                <Card>
                  <CardHeader>
                    <CardTitle>Project Details</CardTitle>
                    <CardDescription>
                      Detailed information about the project configuration
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-muted-foreground">Project Name</p>
                        <p className="text-sm">{project.name}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-muted-foreground">Schema Name</p>
                        <p className="text-sm font-mono">{project.schema_name}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-muted-foreground">Created By</p>
                        <p className="text-sm">{project.creator_role_name || "N/A"}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-muted-foreground">Last Updated</p>
                        <p className="text-sm">{formatDate(project.updated_at)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Description Card */}
                {project.description && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Description</CardTitle>
                      <CardDescription>Project overview and notes</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{project.description}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* Schemas Tab */}
            <TabsContent value="schemas">
              <Card>
                <CardHeader>
                  <CardTitle>Schema Information</CardTitle>
                  <CardDescription>
                    Database schema details for this project
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="rounded-lg border p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Database className="h-4 w-4 text-blue-500" />
                        <span className="font-mono font-medium">{project.schema_name}</span>
                        <Badge variant="secondary" className="ml-auto">
                          Primary Schema
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        This schema contains all tables and data for the {project.name} project.
                      </p>
                      <div className="mt-3 flex gap-4 text-sm">
                        <span className="text-muted-foreground">Tables: {project.table_count}</span>
                        <span className="text-muted-foreground">Size: {project.total_size}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Roles Tab */}
            <TabsContent value="roles">
              <Card>
                <CardHeader>
                  <CardTitle>Assigned Roles</CardTitle>
                  <CardDescription>
                    Database roles with access to this project
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {project.assigned_role_names.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {project.assigned_role_names.map((role) => (
                        <Badge key={role} variant="secondary" className="gap-1 px-3 py-1">
                          <Shield className="h-3 w-3" />
                          {role}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No roles assigned to this project</p>
                      <p className="text-sm">Contact your administrator to assign roles</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Activity Tab */}
            <TabsContent value="activity">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Activity</CardTitle>
                  <CardDescription>
                    Latest changes and updates to the project
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 pb-3 border-b">
                      <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center">
                        <FileText className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">Project Created</p>
                        <p className="text-xs text-muted-foreground">
                          Project was initialized by {project.creator_role_name || "system"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDate(project.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                        <Key className="h-4 w-4 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">Roles Assigned</p>
                        <p className="text-xs text-muted-foreground">
                          {project.assigned_role_count} roles have access to this project
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Last updated {formatDate(project.updated_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}