"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
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

export function ApiKeysSettings() {
  const params = useParams();
  const projectId = params?.id as string;

  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [isRegenerating, setIsRegenerating] = useState<string | null>(null);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState<string | null>(null);
  const [legacyKeysDisabled, setLegacyKeysDisabled] = useState(false);
  const [jwtKeysDisabled, setJwtKeysDisabled] = useState(false);

  const [apiKeys] = useState<APIKey[]>([
    {
      id: "1",
      name: "anon public",
      key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnZCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzMyMTUyNjAwLCJleHAiOjIwNDc3Mjg2MDB9.demo",
      type: "anon",
      created_at: new Date().toISOString(),
    },
    {
      id: "2",
      name: "service_role",
      key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnZCIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE3MzIxNTI2MDAsImV4cCI6MjA0NzcyODYwMH0.secret",
      type: "service_role",
      created_at: new Date().toISOString(),
    },
  ]);

  const handleCopyKey = (key: string) => {
    void navigator.clipboard.writeText(key);
    toast.success("API key copied to clipboard");
  };

  const handleRegenerateKey = async (keyId: string) => {
    setIsRegenerating(keyId);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      toast.success("API key regenerated successfully");
      setShowRegenerateDialog(null);
    } catch {
      toast.error("Failed to regenerate API key");
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project URL</CardTitle>
          <CardDescription>API endpoint for your project</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-muted px-3 py-2 text-sm">
              https://{projectId}.supabase.co
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(`https://${projectId}.supabase.co`);
                toast.success("URL copied");
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Project API keys</CardTitle>
              <CardDescription>
                Your API keys are required for all client and server requests
              </CardDescription>
            </div>
            <Badge variant="outline" className="font-mono">
              JWT
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
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
                    onClick={() => setShowRegenerateDialog(apiKey.id)}
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
                  This key is safe to use in a browser if you have enabled Row Level Security
                  for your tables and configured policies. Prefer using Publishable API keys
                  instead.
                </p>
              )}

              {apiKey.type === "service_role" && (
                <div className="rounded-md border border-red-200 bg-red-50/50 p-3 dark:border-red-900 dark:bg-red-950/20">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-red-600" />
                    <div className="text-sm text-red-700 dark:text-red-300">
                      <p className="font-medium">Warning</p>
                      <p>
                        This key has the ability to bypass Row Level Security. Never share it
                        publicly. If leaked, generate a new JWT secret immediately. Prefer using
                        Secret API keys instead.
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
              This action cannot be undone. Any applications using this key will lose access
              and must be updated with the new key.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => showRegenerateDialog && void handleRegenerateKey(showRegenerateDialog)}
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
