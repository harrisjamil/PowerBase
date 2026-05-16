"use client"

import { useCallback, useEffect, useState, type ComponentType } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import {
  Plug,
  Octagon,
  Mail,
  MessageSquare,
  Database,
  Code,
  Plus,
  Trash2,
  Edit,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Link as LinkIcon,
  Webhook,
  Calendar,
  FileText,
  Loader2,
  RefreshCw,
} from "lucide-react"
import type { CatalogIntegration } from "@/lib/integration-catalog"
import type { IntegrationStatus, PlatformIntegration } from "@/lib/platform-integrations"

const integrationIcons: Record<string, ComponentType<{ className?: string }>> = {
  github: Octagon,
  gmail: Mail,
  slack: MessageSquare,
  postgres: Database,
  mongodb: Database,
  stripe: Plug,
  notion: FileText,
  google_calendar: Calendar,
  webhook: Webhook,
}

const WEBHOOK_EVENTS = [
  "user.created",
  "user.updated",
  "user.deleted",
  "data.synced",
  "alert.triggered",
] as const

type IntegrationsResponse = {
  success: boolean
  integrations?: PlatformIntegration[]
  catalog?: CatalogIntegration[]
  error?: string
}

function formatLastUsed(value: string | null) {
  if (!value) return "Never"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Never"
  return date.toLocaleString()
}

export default function IntegrationsPage() {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState("available")

  const [integrations, setIntegrations] = useState<PlatformIntegration[]>([])
  const [catalog, setCatalog] = useState<CatalogIntegration[]>([])

  const [webhookDialogOpen, setWebhookDialogOpen] = useState(false)
  const [editingWebhook, setEditingWebhook] = useState<PlatformIntegration | null>(null)
  const [webhookConfig, setWebhookConfig] = useState({
    name: "",
    url: "",
    events: [] as string[],
    secret: "",
  })

  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false)
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<CatalogIntegration | null>(null)
  const [apiKeyConfig, setApiKeyConfig] = useState({
    name: "",
    apiKey: "",
    apiSecret: "",
  })

  const loadIntegrations = useCallback(async () => {
    const response = await fetch("/api/admin/integrations")
    const data = (await response.json()) as IntegrationsResponse
    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to load integrations")
    }
    setIntegrations(data.integrations ?? [])
    setCatalog(data.catalog ?? [])
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await loadIntegrations()
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Failed to load integrations")
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
  }, [loadIntegrations])

  const refreshPage = async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true)
    try {
      await loadIntegrations()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to refresh integrations")
    } finally {
      if (showRefreshing) setRefreshing(false)
    }
  }

  const isProviderConnected = (providerId: string) =>
    integrations.some(
      (integration) =>
        integration.providerId === providerId && integration.status === "connected"
    )

  const handleConnectCatalog = async (item: CatalogIntegration) => {
    if (item.type === "api_key") {
      setSelectedCatalogItem(item)
      setApiKeyConfig({ name: item.name, apiKey: "", apiSecret: "" })
      setApiKeyDialogOpen(true)
      return
    }

    if (item.type === "webhook") {
      setEditingWebhook(null)
      setWebhookConfig({ name: "", url: "", events: [], secret: "" })
      setWebhookDialogOpen(true)
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch("/api/admin/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: item.id,
          connectFromCatalog: true,
          type: item.type,
        }),
      })
      const data = (await response.json()) as { success?: boolean; error?: string }
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to connect integration")
      }
      toast.success(`${item.name} connected`)
      await refreshPage()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to connect integration")
    } finally {
      setSubmitting(false)
    }
  }

  const handleSaveWebhook = async () => {
    if (!webhookConfig.name || !webhookConfig.url) {
      toast.error("Please fill in all required fields")
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch(
        editingWebhook
          ? `/api/admin/integrations/${editingWebhook.id}`
          : "/api/admin/integrations",
        {
          method: editingWebhook ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            editingWebhook
              ? {
                  name: webhookConfig.name,
                  webhookUrl: webhookConfig.url,
                  events: webhookConfig.events,
                  webhookSecret: webhookConfig.secret || undefined,
                  status: "connected",
                  errorMessage: null,
                }
              : {
                  name: webhookConfig.name,
                  type: "webhook",
                  webhookUrl: webhookConfig.url,
                  events: webhookConfig.events,
                  webhookSecret: webhookConfig.secret || undefined,
                  icon: "webhook",
                  description: `Webhook endpoint: ${webhookConfig.url}`,
                }
          ),
        }
      )
      const data = (await response.json()) as { success?: boolean; error?: string }
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to save webhook")
      }
      toast.success(editingWebhook ? "Webhook updated" : "Webhook created successfully")
      setWebhookDialogOpen(false)
      setEditingWebhook(null)
      setWebhookConfig({ name: "", url: "", events: [], secret: "" })
      await refreshPage()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save webhook")
    } finally {
      setSubmitting(false)
    }
  }

  const handleSaveApiKey = async () => {
    if (!apiKeyConfig.name || !apiKeyConfig.apiKey) {
      toast.error("Please fill in all required fields")
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch("/api/admin/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: selectedCatalogItem?.id,
          connectFromCatalog: Boolean(selectedCatalogItem),
          name: apiKeyConfig.name,
          type: "api_key",
          icon: selectedCatalogItem?.icon ?? "plug",
          description: selectedCatalogItem
            ? selectedCatalogItem.description
            : `API key integration for ${apiKeyConfig.name}`,
          apiKey: apiKeyConfig.apiKey,
          apiSecret: apiKeyConfig.apiSecret || undefined,
        }),
      })
      const data = (await response.json()) as { success?: boolean; error?: string }
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to save API key integration")
      }
      toast.success("Integration connected successfully")
      setApiKeyDialogOpen(false)
      setSelectedCatalogItem(null)
      setApiKeyConfig({ name: "", apiKey: "", apiSecret: "" })
      await refreshPage()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save integration")
    } finally {
      setSubmitting(false)
    }
  }

  const handleDisconnectIntegration = async (integration: PlatformIntegration) => {
    setSubmitting(true)
    try {
      const response = await fetch(`/api/admin/integrations/${integration.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "disconnected" }),
      })
      const data = (await response.json()) as { success?: boolean; error?: string }
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to disconnect integration")
      }
      toast.success(`${integration.name} has been disconnected`)
      await refreshPage()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disconnect integration")
    } finally {
      setSubmitting(false)
    }
  }

  const handleReconnectIntegration = async (integration: PlatformIntegration) => {
    setSubmitting(true)
    try {
      const response = await fetch(`/api/admin/integrations/${integration.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "connected", errorMessage: null }),
      })
      const data = (await response.json()) as { success?: boolean; error?: string }
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to reconnect integration")
      }
      toast.success(`${integration.name} reconnected`)
      await refreshPage()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reconnect integration")
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteIntegration = async (integration: PlatformIntegration) => {
    setSubmitting(true)
    try {
      const response = await fetch(`/api/admin/integrations/${integration.id}`, {
        method: "DELETE",
      })
      const data = (await response.json()) as { success?: boolean; error?: string }
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to remove integration")
      }
      toast.success(`${integration.name} integration has been removed`)
      await refreshPage()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove integration")
    } finally {
      setSubmitting(false)
    }
  }

  const handleTestWebhook = async (integration: PlatformIntegration) => {
    setSubmitting(true)
    try {
      const response = await fetch(`/api/admin/integrations/${integration.id}/test`, {
        method: "POST",
      })
      const data = (await response.json()) as {
        success?: boolean
        error?: string
        statusCode?: number
      }
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Webhook test failed")
      }
      toast.success(`Webhook test succeeded (HTTP ${data.statusCode ?? 200})`)
      await refreshPage()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Webhook test failed")
    } finally {
      setSubmitting(false)
    }
  }

  const openEditWebhook = (integration: PlatformIntegration) => {
    setEditingWebhook(integration)
    setWebhookConfig({
      name: integration.name,
      url: integration.config.webhookUrl ?? "",
      events: integration.config.events ?? [],
      secret: "",
    })
    setWebhookDialogOpen(true)
  }

  const getStatusIcon = (status: IntegrationStatus) => {
    switch (status) {
      case "connected":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case "disconnected":
        return <XCircle className="h-4 w-4 text-gray-400" />
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />
      default:
        return null
    }
  }

  const getStatusBadge = (status: IntegrationStatus) => {
    switch (status) {
      case "connected":
        return <Badge className="bg-green-500">Connected</Badge>
      case "disconnected":
        return <Badge variant="secondary">Disconnected</Badge>
      case "error":
        return <Badge variant="destructive">Error</Badge>
      default:
        return null
    }
  }

  const connectedIntegrations = integrations.filter((i) => i.status === "connected")
  const errorIntegrations = integrations.filter((i) => i.status === "error")
  const webhookIntegrations = integrations.filter((i) => i.type === "webhook")

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
          <h2 className="text-lg font-semibold">Integrations</h2>
          <p className="text-sm text-muted-foreground">
            Connect PowerBase with your favorite tools and services
          </p>
        </div>
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
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
          <TabsTrigger value="available" className="gap-2">
            <Plug className="h-4 w-4" />
            Available
          </TabsTrigger>
          <TabsTrigger value="connected" className="gap-2">
            <LinkIcon className="h-4 w-4" />
            Connected
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="gap-2">
            <Webhook className="h-4 w-4" />
            Webhooks
          </TabsTrigger>
        </TabsList>

        <TabsContent value="available">
          <Card>
            <CardHeader>
              <CardTitle>Available Integrations</CardTitle>
              <CardDescription>
                Browse and connect to supported third-party services
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {catalog.map((item) => {
                  const IconComponent = integrationIcons[item.icon] || Plug
                  const isConnected = isProviderConnected(item.id)

                  return (
                    <div
                      key={item.id}
                      className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-muted rounded-lg">
                            <IconComponent className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="font-semibold">{item.name}</h3>
                            {item.popular && (
                              <Badge variant="secondary" className="text-xs">
                                Popular
                              </Badge>
                            )}
                          </div>
                        </div>
                        {isConnected && <Badge className="bg-green-500">Connected</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground mb-4">{item.description}</p>
                      <div className="flex items-center justify-between">
                        <Badge variant="outline">{item.category}</Badge>
                        <Button
                          size="sm"
                          onClick={() => void handleConnectCatalog(item)}
                          disabled={isConnected || submitting}
                        >
                          {isConnected ? "Connected" : "Connect"}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="connected">
          <Card>
            <CardHeader>
              <CardTitle>Connected Integrations</CardTitle>
              <CardDescription>Manage your active and configured integrations</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Integration</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Used</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {connectedIntegrations.map((integration) => {
                    const IconComponent = integrationIcons[integration.icon] || Plug
                    return (
                      <TableRow key={integration.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <IconComponent className="h-4 w-4" />
                            {integration.name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getStatusIcon(integration.status)}
                            {getStatusBadge(integration.status)}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatLastUsed(integration.lastUsedAt)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {integration.description}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void handleDisconnectIntegration(integration)}
                              disabled={submitting}
                            >
                              Disconnect
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void handleDeleteIntegration(integration)}
                              disabled={submitting}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {connectedIntegrations.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No connected integrations. Browse the Available tab to connect services.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {errorIntegrations.length > 0 && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-red-600">Integrations with Errors</CardTitle>
                <CardDescription>These integrations need attention</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Integration</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Used</TableHead>
                      <TableHead>Error</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {errorIntegrations.map((integration) => {
                      const IconComponent = integrationIcons[integration.icon] || Plug
                      return (
                        <TableRow key={integration.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <IconComponent className="h-4 w-4" />
                              {integration.name}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getStatusIcon(integration.status)}
                              {getStatusBadge(integration.status)}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatLastUsed(integration.lastUsedAt)}
                          </TableCell>
                          <TableCell className="text-sm text-red-600">
                            {integration.errorMessage || "Connection error"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void handleReconnectIntegration(integration)}
                                disabled={submitting}
                              >
                                Reconnect
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void handleDeleteIntegration(integration)}
                                disabled={submitting}
                                className="text-red-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="webhooks">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Webhook Endpoints</CardTitle>
                  <CardDescription>
                    Create and manage webhook endpoints for real-time data delivery
                  </CardDescription>
                </div>
                <Button
                  onClick={() => {
                    setEditingWebhook(null)
                    setWebhookConfig({ name: "", url: "", events: [], secret: "" })
                    setWebhookDialogOpen(true)
                  }}
                  disabled={submitting}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Webhook
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Endpoint URL</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Events</TableHead>
                    <TableHead>Last Triggered</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {webhookIntegrations.map((webhook) => (
                    <TableRow key={webhook.id}>
                      <TableCell className="font-medium">{webhook.name}</TableCell>
                      <TableCell className="text-sm font-mono">
                        {webhook.config.webhookUrl}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(webhook.status)}
                          {getStatusBadge(webhook.status)}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {webhook.config.events?.length || 0} events
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatLastUsed(webhook.lastUsedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleTestWebhook(webhook)}
                            disabled={submitting}
                          >
                            Test
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditWebhook(webhook)}
                            disabled={submitting}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleDeleteIntegration(webhook)}
                            disabled={submitting}
                            className="text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {webhookIntegrations.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No webhook endpoints configured. Click Create Webhook to get started.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                Webhook Documentation
              </CardTitle>
              <CardDescription>Learn how to receive and handle webhook events</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted rounded-lg p-4">
                <h4 className="font-medium mb-2">Endpoint Requirements</h4>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  <li>Must accept POST requests</li>
                  <li>Should return 2xx status code on success</li>
                  <li>Recommended to verify webhook signatures via X-PowerBase-Signature</li>
                  <li>Endpoint should respond within 10 seconds</li>
                </ul>
              </div>

              <div className="bg-muted rounded-lg p-4">
                <h4 className="font-medium mb-2">Example Payload</h4>
                <pre className="text-xs bg-background p-3 rounded overflow-x-auto">
                  {`{
  "event": "user.created",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "id": "user_123",
    "email": "user@example.com"
  }
}`}
                </pre>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={webhookDialogOpen}
        onOpenChange={(open) => {
          setWebhookDialogOpen(open)
          if (!open) {
            setEditingWebhook(null)
            setWebhookConfig({ name: "", url: "", events: [], secret: "" })
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingWebhook ? "Edit Webhook" : "Create Webhook Integration"}
            </DialogTitle>
            <DialogDescription>
              Configure a webhook endpoint to receive real-time events
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="webhook-name">Webhook Name *</Label>
              <Input
                id="webhook-name"
                value={webhookConfig.name}
                onChange={(e) => setWebhookConfig({ ...webhookConfig, name: e.target.value })}
                placeholder="e.g., Production Webhook"
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhook-url">Endpoint URL *</Label>
              <Input
                id="webhook-url"
                value={webhookConfig.url}
                onChange={(e) => setWebhookConfig({ ...webhookConfig, url: e.target.value })}
                placeholder="https://api.example.com/webhook"
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhook-secret">
                Secret {editingWebhook ? "(leave blank to keep)" : "(Optional)"}
              </Label>
              <Input
                id="webhook-secret"
                type="password"
                value={webhookConfig.secret}
                onChange={(e) => setWebhookConfig({ ...webhookConfig, secret: e.target.value })}
                placeholder="Used to verify webhook signatures"
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <Label>Events to subscribe</Label>
              <div className="space-y-2">
                {WEBHOOK_EVENTS.map((event) => (
                  <label key={event} className="flex items-center gap-2">
                    <Checkbox
                      checked={webhookConfig.events.includes(event)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setWebhookConfig({
                            ...webhookConfig,
                            events: [...webhookConfig.events, event],
                          })
                        } else {
                          setWebhookConfig({
                            ...webhookConfig,
                            events: webhookConfig.events.filter((item) => item !== event),
                          })
                        }
                      }}
                      disabled={submitting}
                    />
                    <span className="text-sm">{event}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setWebhookDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleSaveWebhook()} disabled={submitting}>
              {submitting ? "Saving..." : editingWebhook ? "Update Webhook" : "Create Webhook"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={apiKeyDialogOpen} onOpenChange={setApiKeyDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add API Key Integration</DialogTitle>
            <DialogDescription>
              {selectedCatalogItem
                ? `Connect ${selectedCatalogItem.name} using API key authentication`
                : "Connect using API key authentication"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api-name">Integration Name *</Label>
              <Input
                id="api-name"
                value={apiKeyConfig.name}
                onChange={(e) => setApiKeyConfig({ ...apiKeyConfig, name: e.target.value })}
                placeholder="e.g., Production Database"
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="api-key">API Key *</Label>
              <Input
                id="api-key"
                type="password"
                value={apiKeyConfig.apiKey}
                onChange={(e) => setApiKeyConfig({ ...apiKeyConfig, apiKey: e.target.value })}
                placeholder="Enter your API key"
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="api-secret">API Secret (Optional)</Label>
              <Input
                id="api-secret"
                type="password"
                value={apiKeyConfig.apiSecret}
                onChange={(e) => setApiKeyConfig({ ...apiKeyConfig, apiSecret: e.target.value })}
                placeholder="Enter your API secret"
                disabled={submitting}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setApiKeyDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleSaveApiKey()} disabled={submitting}>
              {submitting ? "Connecting..." : "Connect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
