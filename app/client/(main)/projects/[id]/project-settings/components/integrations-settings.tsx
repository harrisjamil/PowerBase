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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Box, // For GitHub alternative
  Bell,
  Zap,
  Database,
  Cloud,
  Webhook,
  Mail,
  MessageSquare,
  TrendingUp,
  Code,
  Shield,
  Plus,
  Trash2,
  MoreVertical,
  Check,
  AlertCircle,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Integration = {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: "database" | "messaging" | "analytics" | "auth" | "storage" | "automation";
  isConnected: boolean;
  config?: Record<string, any>;
  connectedAt?: string;
  lastSynced?: string;
};

type Webhook = {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
  lastTriggered?: string;
};

const availableIntegrations: Integration[] = [
  {
    id: "github",
    name: "GitHub",
    description: "Sync your repositories, automate deployments, and manage code reviews",
    icon: <Box className="h-8 w-8" />,
    category: "automation",
    isConnected: false,
  },
  {
    id: "gitlab",
    name: "GitLab",
    description: "Connect GitLab repositories and automate CI/CD pipelines",
    icon: <Box className="h-8 w-8" />,
    category: "automation",
    isConnected: false,
  },
  {
    id: "slack",
    name: "Slack",
    description: "Receive notifications and alerts directly in your Slack channels",
    icon: <Bell className="h-8 w-8" />,
    category: "messaging",
    isConnected: false,
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    description: "Connect external PostgreSQL databases for data replication",
    icon: <Database className="h-8 w-8" />,
    category: "database",
    isConnected: false,
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Sync payment data and manage subscriptions",
    icon: <Zap className="h-8 w-8" />,
    category: "analytics",
    isConnected: false,
  },
  {
    id: "aws",
    name: "AWS S3",
    description: "Connect to S3 buckets for file storage and backups",
    icon: <Cloud className="h-8 w-8" />,
    category: "storage",
    isConnected: false,
  },
  {
    id: "sendgrid",
    name: "SendGrid",
    description: "Send transactional emails and manage email templates",
    icon: <Mail className="h-8 w-8" />,
    category: "messaging",
    isConnected: false,
  },
  {
    id: "discord",
    name: "Discord",
    description: "Send webhook notifications to Discord channels",
    icon: <MessageSquare className="h-8 w-8" />,
    category: "messaging",
    isConnected: false,
  },
];

export default function IntegrationsSettings() {
  const params = useParams();
  const projectId = params?.id as string;

  const [integrations, setIntegrations] = useState<Integration[]>(availableIntegrations);
  const [webhooks, setWebhooks] = useState<Webhook[]>([
    {
      id: "1",
      name: "Production Webhook",
      url: "https://api.example.com/webhooks/prod",
      events: ["table.insert", "table.update", "table.delete"],
      isActive: true,
      createdAt: new Date().toISOString(),
      lastTriggered: new Date().toISOString(),
    },
    {
      id: "2",
      name: "Staging Webhook",
      url: "https://staging-api.example.com/webhooks",
      events: ["table.insert", "table.update"],
      isActive: false,
      createdAt: new Date().toISOString(),
    },
  ]);

  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [isConnecting, setIsConnecting] = useState<string | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState<string | null>(null);
  const [showWebhookDialog, setShowWebhookDialog] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [webhookForm, setWebhookForm] = useState({
    name: "",
    url: "",
    events: [] as string[],
  });

  const categories = [
    { id: "all", label: "All Integrations" },
    { id: "database", label: "Database" },
    { id: "messaging", label: "Messaging" },
    { id: "analytics", label: "Analytics" },
    { id: "auth", label: "Authentication" },
    { id: "storage", label: "Storage" },
    { id: "automation", label: "Automation" },
  ];

  const eventOptions = [
    { id: "table.insert", label: "Row Insert" },
    { id: "table.update", label: "Row Update" },
    { id: "table.delete", label: "Row Delete" },
    { id: "table.truncate", label: "Table Truncate" },
    { id: "auth.user.create", label: "User Created" },
    { id: "auth.user.update", label: "User Updated" },
    { id: "auth.user.delete", label: "User Deleted" },
    { id: "storage.file.create", label: "File Uploaded" },
    { id: "storage.file.delete", label: "File Deleted" },
  ];

  const filteredIntegrations = integrations.filter(
    (integration) =>
      selectedCategory === "all" || integration.category === selectedCategory
  );

  const handleConnect = async (integrationId: string) => {
    setIsConnecting(integrationId);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setIntegrations((prev) =>
        prev.map((integration) =>
          integration.id === integrationId
            ? { ...integration, isConnected: true, connectedAt: new Date().toISOString() }
            : integration
        )
      );
      toast.success("Integration connected successfully");
    } catch (error) {
      toast.error("Failed to connect integration");
    } finally {
      setIsConnecting(null);
    }
  };

  const handleDisconnect = async (integrationId: string) => {
    setIsDisconnecting(integrationId);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setIntegrations((prev) =>
        prev.map((integration) =>
          integration.id === integrationId
            ? { ...integration, isConnected: false }
            : integration
        )
      );
      toast.success("Integration disconnected");
    } catch (error) {
      toast.error("Failed to disconnect integration");
    } finally {
      setIsDisconnecting(null);
    }
  };

  const handleCreateWebhook = async () => {
    if (!webhookForm.name || !webhookForm.url) {
      toast.error("Name and URL are required");
      return;
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const newWebhook: Webhook = {
        id: Date.now().toString(),
        name: webhookForm.name,
        url: webhookForm.url,
        events: webhookForm.events,
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      setWebhooks((prev) => [...prev, newWebhook]);
      toast.success("Webhook created successfully");
      setShowWebhookDialog(false);
      setWebhookForm({ name: "", url: "", events: [] });
    } catch (error) {
      toast.error("Failed to create webhook");
    }
  };

  const handleDeleteWebhook = async (webhookId: string) => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      setWebhooks((prev) => prev.filter((webhook) => webhook.id !== webhookId));
      toast.success("Webhook deleted");
    } catch (error) {
      toast.error("Failed to delete webhook");
    }
  };

  const handleToggleWebhook = async (webhookId: string, isActive: boolean) => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      setWebhooks((prev) =>
        prev.map((webhook) =>
          webhook.id === webhookId ? { ...webhook, isActive } : webhook
        )
      );
      toast.success(isActive ? "Webhook activated" : "Webhook deactivated");
    } catch (error) {
      toast.error("Failed to update webhook status");
    }
  };

  const handleTestWebhook = async (webhook: Webhook) => {
    toast.loading("Testing webhook...");
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      toast.dismiss();
      toast.success("Webhook test successful");
    } catch (error) {
      toast.dismiss();
      toast.error("Webhook test failed");
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Integrations</h2>
        <p className="text-sm text-muted-foreground">
          Connect external services and tools to extend your project's functionality
        </p>
      </div>

      <Tabs defaultValue="integrations" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
        </TabsList>

        <TabsContent value="integrations" className="space-y-6">
          {/* Category Filter */}
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <Button
                key={category.id}
                variant={selectedCategory === category.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(category.id)}
              >
                {category.label}
              </Button>
            ))}
          </div>

          {/* Integrations Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredIntegrations.map((integration) => (
              <Card
                key={integration.id}
                className={`relative transition-all hover:shadow-md ${
                  integration.isConnected ? "border-green-500/50 bg-green-50/30 dark:bg-green-950/20" : ""
                }`}
              >
                <CardHeader className="flex flex-row items-start gap-4 space-y-0">
                  <div className="rounded-lg bg-muted p-2">
                    {integration.icon}
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-base">{integration.name}</CardTitle>
                    <CardDescription className="mt-1 line-clamp-2 text-xs">
                      {integration.description}
                    </CardDescription>
                  </div>
                  {integration.isConnected && (
                    <Badge variant="secondary" className="shrink-0">
                      Connected
                    </Badge>
                  )}
                </CardHeader>
                <CardFooter className="justify-end pt-2">
                  {integration.isConnected ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDisconnect(integration.id)}
                      disabled={isDisconnecting === integration.id}
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      {isDisconnecting === integration.id ? (
                        <RefreshCw className="mr-2 h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="mr-2 h-3 w-3" />
                      )}
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleConnect(integration.id)}
                      disabled={isConnecting === integration.id}
                    >
                      {isConnecting === integration.id ? (
                        <RefreshCw className="mr-2 h-3 w-3 animate-spin" />
                      ) : (
                        <Plus className="mr-2 h-3 w-3" />
                      )}
                      Connect
                    </Button>
                  )}
                </CardFooter>
              </Card>
            ))}
          </div>

          {filteredIntegrations.length === 0 && (
            <Card>
              <CardContent className="flex min-h-[300px] flex-col items-center justify-center py-12">
                <div className="rounded-full bg-muted p-4 mb-4">
                  <Zap className="h-12 w-12 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No integrations found</h3>
                <p className="text-sm text-muted-foreground text-center max-w-md">
                  No integrations available in this category. Try selecting a different category.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="webhooks" className="space-y-6">
          {/* Webhooks Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Webhooks</h3>
              <p className="text-sm text-muted-foreground">
                Configure webhooks to receive real-time events from your project
              </p>
            </div>
            <Button onClick={() => setShowWebhookDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Webhook
            </Button>
          </div>

          {/* Webhooks List */}
          <div className="space-y-4">
            {webhooks.length === 0 ? (
              <Card>
                <CardContent className="flex min-h-[300px] flex-col items-center justify-center py-12">
                  <div className="rounded-full bg-muted p-4 mb-4">
                    <Webhook className="h-12 w-12 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No webhooks configured</h3>
                  <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
                    Create your first webhook to start receiving event notifications
                  </p>
                  <Button onClick={() => setShowWebhookDialog(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Webhook
                  </Button>
                </CardContent>
              </Card>
            ) : (
              webhooks.map((webhook) => (
                <Card key={webhook.id}>
                  <CardHeader className="flex flex-row items-start justify-between space-y-0">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{webhook.name}</CardTitle>
                        {webhook.isActive ? (
                          <Badge variant="default" className="bg-green-600">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </div>
                      <CardDescription className="font-mono text-sm">
                        {webhook.url}
                      </CardDescription>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleTestWebhook(webhook)}>
                          <Zap className="mr-2 h-4 w-4" />
                          Test Webhook
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleToggleWebhook(webhook.id, !webhook.isActive)}
                        >
                          {webhook.isActive ? (
                            <>
                              <AlertCircle className="mr-2 h-4 w-4" />
                              Deactivate
                            </>
                          ) : (
                            <>
                              <Check className="mr-2 h-4 w-4" />
                              Activate
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDeleteWebhook(webhook.id)}
                          className="text-red-600"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">Events</Label>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {webhook.events.map((event) => (
                            <Badge key={event} variant="outline" className="text-xs">
                              {eventOptions.find((e) => e.id === event)?.label || event}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        {webhook.createdAt && (
                          <span>Created: {new Date(webhook.createdAt).toLocaleDateString()}</span>
                        )}
                        {webhook.lastTriggered && (
                          <span>Last triggered: {new Date(webhook.lastTriggered).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Create/Edit Webhook Dialog */}
      <Dialog open={showWebhookDialog} onOpenChange={setShowWebhookDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Webhook</DialogTitle>
            <DialogDescription>
              Configure a webhook endpoint to receive real-time events
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="webhook-name">Name</Label>
              <Input
                id="webhook-name"
                placeholder="e.g., Production Webhook"
                value={webhookForm.name}
                onChange={(e) => setWebhookForm({ ...webhookForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="webhook-url">Endpoint URL</Label>
              <Input
                id="webhook-url"
                placeholder="https://example.com/webhook"
                value={webhookForm.url}
                onChange={(e) => setWebhookForm({ ...webhookForm, url: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Events</Label>
              <ScrollArea className="h-48 rounded-md border p-2">
                <div className="space-y-2">
                  {eventOptions.map((event) => (
                    <label key={event.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={webhookForm.events.includes(event.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setWebhookForm({
                              ...webhookForm,
                              events: [...webhookForm.events, event.id],
                            });
                          } else {
                            setWebhookForm({
                              ...webhookForm,
                              events: webhookForm.events.filter((ev) => ev !== event.id),
                            });
                          }
                        }}
                        className="rounded border-gray-300"
                      />
                      {event.label}
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWebhookDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateWebhook}>
              Create Webhook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}