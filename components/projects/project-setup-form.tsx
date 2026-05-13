"use client"

import { useMemo, useState } from "react"
import { ChevronDown, Database, GitBranch, Globe, Server, Shield, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

export type ProjectFormData = {
  name: string
  description: string
  organization: string
  databasePassword: string
  region: string
  postgresType: "postgres" | "orioledb"
  dataApiEnabled: boolean
  autoExposeTables: boolean
  autoRLS: boolean
  githubConnected: boolean
  githubRepo: string
}

export type ProjectOrganization = {
  id: string
  name: string
  plan: string
}

type ProjectSetupFormProps = {
  onCancel?: () => void
  onSubmit: (data: ProjectFormData) => Promise<void>
  organizations?: ProjectOrganization[]
  isSubmitting?: boolean
  submitLabel?: string
}

export const PROJECT_REGIONS = [
  { value: "us-east-1", label: "US East (N. Virginia)", group: "Americas" },
  { value: "us-west-2", label: "US West (Oregon)", group: "Americas" },
  { value: "eu-west-1", label: "EU West (Ireland)", group: "Europe" },
  { value: "eu-central-1", label: "EU Central (Frankfurt)", group: "Europe" },
  {
    value: "ap-southeast-1",
    label: "Asia Pacific (Singapore)",
    group: "Asia-Pacific",
    recommended: true,
  },
  { value: "ap-southeast-2", label: "Asia Pacific (Sydney)", group: "Asia-Pacific" },
  { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)", group: "Asia-Pacific" },
  { value: "ap-south-1", label: "Asia Pacific (Mumbai)", group: "Asia-Pacific" },
] as const

function getInitialFormData(organizations: ProjectOrganization[]): ProjectFormData {
  return {
    name: "",
    description: "",
    organization: organizations[0]?.id || "",
    databasePassword: "",
    region: "ap-southeast-1",
    postgresType: "postgres",
    dataApiEnabled: true,
    autoExposeTables: false,
    autoRLS: true,
    githubConnected: false,
    githubRepo: "",
  }
}

export function ProjectSetupForm({
  onCancel,
  onSubmit,
  organizations = [{ id: "1", name: "Haris Mian's Org", plan: "Free" }],
  isSubmitting = false,
  submitLabel = "Create new project",
}: ProjectSetupFormProps) {
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false)
  const [generatedPassword, setGeneratedPassword] = useState("")
  const [formData, setFormData] = useState<ProjectFormData>(() =>
    getInitialFormData(organizations)
  )

  const groupedRegions = useMemo(
    () =>
      Object.entries(
        PROJECT_REGIONS.reduce<Record<string, (typeof PROJECT_REGIONS)[number][]>>(
          (accumulator, region) => {
            if (!accumulator[region.group]) {
              accumulator[region.group] = []
            }
            accumulator[region.group].push(region)
            return accumulator
          },
          {}
        )
      ),
    []
  )

  const selectedOrg = organizations.find((org) => org.id === formData.organization)
  const schemaNamePreview = formData.name.trim()
  const selectedRegionLabel =
    PROJECT_REGIONS.find((region) => region.value === formData.region)?.label || formData.region

  const generateStrongPassword = () => {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*"
    let password = ""
    for (let i = 0; i < 24; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    setGeneratedPassword(password)
    setFormData((current) => ({ ...current, databasePassword: password }))
  }

  const resetForm = () => {
    setFormData(getInitialFormData(organizations))
    setGeneratedPassword("")
    setShowAdvancedConfig(false)
  }

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.databasePassword) {
      return
    }

    await onSubmit(formData)
    resetForm()
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_380px]">
      <div className="space-y-6">
        <section className="rounded-2xl border p-5">
          <div className="mb-4">
            <h3 className="text-base font-semibold">Project details</h3>
            <p className="text-sm text-muted-foreground">
              Start with the project identity and the schema name that will be created.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-2">
              <Label>Organization</Label>
              <Select
                value={formData.organization}
                onValueChange={(value) =>
                  setFormData((current) => ({ ...current, organization: value }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      <div className="flex justify-between gap-3">
                        <span>{org.name}</span>
                        <span className="text-xs text-muted-foreground">{org.plan}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedOrg ? (
                <p className="text-xs text-muted-foreground">Plan: {selectedOrg.plan}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-name">Project name</Label>
              <Input
                id="project-name"
                value={formData.name}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="e.g., my-awesome-project"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                The same value will be used as the schema name.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            <Label>Project description</Label>
            <Textarea
              value={formData.description}
              onChange={(event) =>
                setFormData((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="Add a description for your project..."
              rows={4}
              className="resize-none"
            />
          </div>

          <div className="mt-5 rounded-xl border bg-muted/30 p-4">
            <div className="flex items-start gap-3">
              <Database className="mt-0.5 h-4 w-4 text-primary" />
              <div className="min-w-0">
                <div className="text-sm font-medium">Schema that will be created</div>
                <div className="mt-1 rounded-lg border bg-background px-3 py-2 font-mono text-sm">
                  {schemaNamePreview || "your-project-name"}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  PowerBase will create a Postgres schema with this exact project name.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border p-5">
          <div className="mb-4">
            <h3 className="text-base font-semibold">Database configuration</h3>
            <p className="text-sm text-muted-foreground">
              Configure the database password, location, and engine for this project.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="db-password">Database password</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="db-password"
                  type="password"
                  value={formData.databasePassword}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      databasePassword: event.target.value,
                    }))
                  }
                  placeholder="Enter a strong password"
                  className="flex-1"
                />
                <Button type="button" variant="outline" onClick={generateStrongPassword} size="sm">
                  <Sparkles className="mr-1 h-4 w-4" />
                  Generate
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                This password protects the project database, so it should be strong and unique.
              </p>
              {generatedPassword ? (
                <div className="rounded-lg border bg-muted px-3 py-2">
                  <p className="text-xs font-mono break-all">{generatedPassword}</p>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>Region</Label>
              <Select
                value={formData.region}
                onValueChange={(value) =>
                  setFormData((current) => ({ ...current, region: value }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {groupedRegions.map(([group, regions]) => (
                    <div key={group}>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                        {group}
                      </div>
                      {regions.map((region) => (
                        <SelectItem key={region.value} value={region.value}>
                          <div className="flex items-center gap-2">
                            <span>{region.label}</span>
                            {region.recommended ? (
                              <span className="text-xs text-green-600">Recommended</span>
                            ) : null}
                          </div>
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Choose the region closest to your users for better performance.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Postgres Type</Label>
              <div className="space-y-2 rounded-xl border p-3">
                <label className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-muted/40">
                  <input
                    type="radio"
                    name="postgresType"
                    value="postgres"
                    checked={formData.postgresType === "postgres"}
                    onChange={() =>
                      setFormData((current) => ({ ...current, postgresType: "postgres" }))
                    }
                    className="mt-0.5 h-4 w-4"
                  />
                  <div>
                    <div className="font-medium text-sm">Postgres</div>
                    <div className="text-xs text-muted-foreground">
                      Default and recommended for production workloads.
                    </div>
                  </div>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-muted/40">
                  <input
                    type="radio"
                    name="postgresType"
                    value="orioledb"
                    checked={formData.postgresType === "orioledb"}
                    onChange={() =>
                      setFormData((current) => ({ ...current, postgresType: "orioledb" }))
                    }
                    className="mt-0.5 h-4 w-4"
                  />
                  <div>
                    <div className="font-medium text-sm">Postgres with OrioleDB</div>
                    <div className="text-xs text-muted-foreground">
                      Alpha option, not recommended for production workloads.
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border p-5">
          <div className="mb-4">
            <h3 className="text-base font-semibold">Security and integrations</h3>
            <p className="text-sm text-muted-foreground">
              Match the project defaults you want from day one.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>GitHub Integration</Label>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "w-full justify-start gap-2",
                    formData.githubConnected && "border-green-500 bg-green-50"
                  )}
                  onClick={() =>
                    setFormData((current) => ({
                      ...current,
                      githubConnected: !current.githubConnected,
                    }))
                  }
                >
                  <GitBranch className="h-4 w-4" />
                  {formData.githubConnected ? "Connected to GitHub" : "Connect GitHub"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Ideal for code-driven database workflows similar to hosted project setup flows.
                </p>
                {formData.githubConnected ? (
                  <Input
                    placeholder="Repository name (e.g., username/repo)"
                    value={formData.githubRepo}
                    onChange={(event) =>
                      setFormData((current) => ({
                        ...current,
                        githubRepo: event.target.value,
                      }))
                    }
                  />
                ) : null}
              </div>
            </div>

            <div className="space-y-3 rounded-xl border p-4">
              <Label>Default project settings</Label>

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label className="text-sm font-normal">Enable Data API</Label>
                  <p className="text-xs text-muted-foreground">
                    Autogenerate a REST API for the project schema.
                  </p>
                </div>
                <Switch
                  checked={formData.dataApiEnabled}
                  onCheckedChange={(checked: boolean) =>
                    setFormData((current) => ({ ...current, dataApiEnabled: checked }))
                  }
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label className="text-sm font-normal">Auto expose new tables</Label>
                  <p className="text-xs text-muted-foreground">
                    Grants default API-role access for new tables.
                  </p>
                </div>
                <Switch
                  checked={formData.autoExposeTables}
                  onCheckedChange={(checked: boolean) =>
                    setFormData((current) => ({ ...current, autoExposeTables: checked }))
                  }
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label className="text-sm font-normal">Enable automatic RLS</Label>
                  <p className="text-xs text-muted-foreground">
                    Turns on Row Level Security for new tables by default.
                  </p>
                </div>
                <Switch
                  checked={formData.autoRLS}
                  onCheckedChange={(checked: boolean) =>
                    setFormData((current) => ({ ...current, autoRLS: checked }))
                  }
                />
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border p-5">
          <Button
            type="button"
            variant="ghost"
            className="h-auto p-0 font-medium"
            onClick={() => setShowAdvancedConfig((current) => !current)}
          >
            <ChevronDown
              className={cn(
                "mr-1 h-4 w-4 transition-transform",
                showAdvancedConfig && "rotate-180"
              )}
            />
            Advanced Configuration
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">
            These are placeholder controls for future hosted-style provisioning options.
          </p>

          {showAdvancedConfig ? (
            <div className="mt-4 rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">
              Advanced project provisioning options can be added here next, such as
              compute size, Postgres version, or networking controls.
            </div>
          ) : null}
        </section>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          {onCancel ? (
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !formData.name.trim() || !formData.databasePassword}
          >
            {isSubmitting ? "Creating..." : submitLabel}
          </Button>
        </div>
      </div>

      <aside className="space-y-5 rounded-2xl border bg-muted/20 p-6 xl:sticky xl:top-6 xl:self-start">
        <div>
          <h3 className="text-base font-semibold">Project preview</h3>
          <p className="text-sm text-muted-foreground">
            Review the main settings before provisioning the project.
          </p>
        </div>

        <div className="rounded-2xl border bg-background p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">Project</div>
          <div className="mt-1 text-lg font-semibold">
            {schemaNamePreview || "Untitled project"}
          </div>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <Database className="mt-0.5 h-4 w-4 text-primary" />
              <div>
                <div className="font-medium">Schema name</div>
                <div className="font-mono text-muted-foreground">
                  {schemaNamePreview || "your-project-name"}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Globe className="mt-0.5 h-4 w-4 text-primary" />
              <div>
                <div className="font-medium">Region</div>
                <div className="text-muted-foreground">{selectedRegionLabel}</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Server className="mt-0.5 h-4 w-4 text-primary" />
              <div>
                <div className="font-medium">Database engine</div>
                <div className="text-muted-foreground">
                  {formData.postgresType === "postgres"
                    ? "Postgres"
                    : "Postgres with OrioleDB"}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Shield className="mt-0.5 h-4 w-4 text-primary" />
              <div>
                <div className="font-medium">Security defaults</div>
                <div className="text-muted-foreground">
                  Data API {formData.dataApiEnabled ? "enabled" : "disabled"}, RLS{" "}
                  {formData.autoRLS ? "enabled" : "disabled"}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <GitBranch className="mt-0.5 h-4 w-4 text-primary" />
              <div>
                <div className="font-medium">GitHub</div>
                <div className="text-muted-foreground">
                  {formData.githubConnected
                    ? formData.githubRepo || "Connected"
                    : "Not connected"}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-background p-5">
          <div className="text-sm font-medium">What happens on create</div>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>Project record is added to the admin project list.</li>
            <li>A schema with the same project name is created automatically.</li>
            <li>Selected database defaults are applied for the new project.</li>
          </ul>
        </div>
      </aside>
    </div>
  )
}
