"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Key,
  Copy,
  Eye,
  EyeOff,
  AlertTriangle,
  RefreshCw,
  Loader2,
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
import { Separator } from "@/components/ui/separator";

type APIKey = {
  id: string;
  name: string;
  key: string;
  type: "anon" | "service_role";
  created_at: string;
  last_used?: string;
};

type ApiKeysResponse = {
  success: boolean;
  project_url?: string;
  schema_name?: string;
  api_keys?: APIKey[];
  error?: string;
};

export function ApiKeysSettings() {
  const params = useParams();
  const projectId = params?.id as string;

  const [apiKeys, setApiKeys] = useState<APIKey[]>([]);
  const [projectUrl, setProjectUrl] = useState("");
  const [schemaName, setSchemaName] = useState("");
  const [loading, setLoading] = useState(true);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [isRegenerating, setIsRegenerating] = useState<string | null>(null);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState<string | null>(null);
  const [legacyKeysDisabled, setLegacyKeysDisabled] = useState(false);
  const [jwtKeysDisabled, setJwtKeysDisabled] = useState(false);

  const loadApiKeys = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/api-keys`, {
        cache: "no-store",
      });
      const data = (await response.json()) as ApiKeysResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load API keys");
      }

      setApiKeys(data.api_keys ?? []);
      setProjectUrl(data.project_url ?? "");
      setSchemaName(data.schema_name ?? "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadApiKeys();
  }, [loadApiKeys]);

  const handleCopyKey = (key: string) => {
    void navigator.clipboard.writeText(key);
    toast.success("API key copied to clipboard");
  };

  const handleRegenerateKey = async (keyType: "anon" | "service_role") => {
    setIsRegenerating(keyType);
    try {
      const response = await fetch(`/api/projects/${projectId}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: keyType }),
      });
      const data = (await response.json()) as {
        success: boolean;
        api_key?: APIKey;
        error?: string;
      };

      if (!response.ok || !data.success || !data.api_key) {
        throw new Error(data.error || "Failed to regenerate API key");
      }

      setApiKeys((current) =>
        current.map((entry) => (entry.type === keyType ? data.api_key! : entry))
      );
      toast.success("API key regenerated successfully");
      setShowRegenerateDialog(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to regenerate API key");
    } finally {
      setIsRegenerating(null);
    }
  };

  const getKeyPreview = (key: string, show: boolean) => {
    if (show) return key;
    return "•".repeat(40) + key.slice(-8);
  };

  const toggleKeyVisibility = (keyId: string) => {
    setVisibleKeys((current) => ({
      ...current,
      [keyId]: !current[keyId],
    }));
  };

  const regeneratingKey = apiKeys.find((entry) => entry.type === showRegenerateDialog);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading API keys...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project URL</CardTitle>
          <CardDescription>API endpoint for this project</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-muted px-3 py-2 text-sm break-all">
              {projectUrl || "—"}
            </code>
            <Button
              variant="outline"
              size="sm"
              disabled={!projectUrl}
              onClick={() => {
                if (!projectUrl) return;
                void navigator.clipboard.writeText(projectUrl);
                toast.success("URL copied");
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          {schemaName ? (
            <p className="text-xs text-muted-foreground">
              Backed by PostgreSQL schema <span className="font-mono">{schemaName}</span>
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Use with your <span className="font-mono">anon</span> key plus a PostgreSQL user assigned to
            this project (<span className="font-mono">x-powerbase-pg-user</span> /{" "}
            <span className="font-mono">x-powerbase-pg-password</span> headers).
          </p>
        </CardContent>
      </Card>

      {projectUrl && apiKeys.some((key) => key.type === "anon") ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Connect from another app</CardTitle>
            <CardDescription>
              Copy <span className="font-mono">lib/powerbase-client.ts</span> into your repo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 text-xs leading-relaxed">
              {`import { createPowerBaseClient } from "@/lib/powerbase-client";

const db = createPowerBaseClient({
  url: "${projectUrl}",
  apiKey: process.env.POWERBASE_ANON_KEY!,
  pgUser: process.env.POWERBASE_REST_PG_USER!,
  pgPassword: process.env.POWERBASE_REST_PG_PASSWORD!,
});

await db.from("users").insert({ id: "2", full_name: "Jane" });
const { data, error } = await db.from("users").select();`}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Project API keys</CardTitle>
              <CardDescription>
                JWT keys for this project. Created automatically when the project is registered.
              </CardDescription>
            </div>
            <Badge variant="outline" className="font-mono">
              JWT
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {apiKeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No API keys found. Keys are created when a schema is registered as a project from the
              admin dashboard.
            </p>
          ) : null}
          {apiKeys.map((apiKey) => (
            <div key={apiKey.id} className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Key className="h-4 w-4 text-muted-foreground" />
                  <Label className="font-mono text-sm font-medium">{apiKey.name}</Label>
                  {apiKey.type === "anon" && (
                    <Badge variant="secondary" className="text-xs">
                      Publishable
                    </Badge>
                  )}
                  {apiKey.type === "service_role" && (
                    <Badge variant="destructive" className="text-xs">
                      Secret
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleKeyVisibility(apiKey.id)}
                  >
                    {visibleKeys[apiKey.id] ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleCopyKey(apiKey.key)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowRegenerateDialog(apiKey.type)}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <code className="block w-full rounded-md border bg-muted/30 px-3 py-2 font-mono text-sm break-all">
                {getKeyPreview(apiKey.key, Boolean(visibleKeys[apiKey.id]))}
              </code>

              {apiKey.type === "anon" && (
                <p className="text-xs text-muted-foreground">
                  Safe for browser use when row-level security is configured. Use with the project
                  URL and schema-backed REST endpoints.
                </p>
              )}

              {apiKey.type === "service_role" && (
                <div className="rounded-md border border-red-200 bg-red-50/50 p-3 dark:border-red-900 dark:bg-red-950/20">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-red-600" />
                    <div className="text-sm text-red-700 dark:text-red-300">
                      <p className="font-medium">Warning</p>
                      <p>
                        This key bypasses client-side restrictions. Never expose it publicly. If
                        leaked, regenerate it immediately.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              <Separator className="last:hidden" />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Legacy API keys</CardTitle>
          <CardDescription>Manage legacy API key settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Disable legacy API keys</Label>
              <p className="text-sm text-muted-foreground">
                Make sure you are no longer using your legacy API keys before proceeding
              </p>
            </div>
            <Switch checked={legacyKeysDisabled} onCheckedChange={setLegacyKeysDisabled} />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Disable JWT-based API keys</Label>
              <p className="text-sm text-muted-foreground">
                Disable JWT-based authentication for API requests
              </p>
            </div>
            <Switch checked={jwtKeysDisabled} onCheckedChange={setJwtKeysDisabled} />
          </div>
        </CardContent>
        <CardFooter className="border-t px-6 py-4">
          <p className="text-xs text-muted-foreground">
            Changes to API key settings may take a few minutes to propagate
          </p>
        </CardFooter>
      </Card>

      <AlertDialog open={!!showRegenerateDialog} onOpenChange={() => setShowRegenerateDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate API key</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Any applications using the{" "}
              {regeneratingKey?.name ?? "selected"} key will lose access and must be updated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                showRegenerateDialog &&
                void handleRegenerateKey(showRegenerateDialog as "anon" | "service_role")
              }
              disabled={isRegenerating === showRegenerateDialog}
              className="bg-red-600 hover:bg-red-700"
            >
              {isRegenerating === showRegenerateDialog ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Regenerating...
                </>
              ) : (
                "Regenerate"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
