"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { HelpCircle, ChevronDown, Sparkles, Github } from "lucide-react"
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

type CreateProjectModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: ProjectFormData) => Promise<void>
  organizations?: { id: string; name: string; plan: string }[]
  isSubmitting?: boolean
}

const regions = [
  { value: "us-east-1", label: "US East (N. Virginia)", group: "Americas" },
  { value: "us-west-2", label: "US West (Oregon)", group: "Americas" },
  { value: "eu-west-1", label: "EU West (Ireland)", group: "Europe" },
  { value: "eu-central-1", label: "EU Central (Frankfurt)", group: "Europe" },
  { value: "ap-southeast-1", label: "Asia Pacific (Singapore)", group: "Asia-Pacific", recommended: true },
  { value: "ap-southeast-2", label: "Asia Pacific (Sydney)", group: "Asia-Pacific" },
  { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)", group: "Asia-Pacific" },
  { value: "ap-south-1", label: "Asia Pacific (Mumbai)", group: "Asia-Pacific" },
]

export function CreateProjectModal({
  open,
  onOpenChange,
  onSubmit,
  organizations = [{ id: "1", name: "Haris Mian's Org", plan: "Free" }],
  isSubmitting = false,
}: CreateProjectModalProps) {
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false)
  const [generatedPassword, setGeneratedPassword] = useState("")
  const [formData, setFormData] = useState<ProjectFormData>({
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
  })

  const generateStrongPassword = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*"
    let password = ""
    for (let i = 0; i < 24; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    setGeneratedPassword(password)
    setFormData({ ...formData, databasePassword: password })
  }

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      return
    }
    if (!formData.databasePassword) {
      return
    }
    await onSubmit(formData)
    // Reset form after successful submission
    setFormData({
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
    })
    setGeneratedPassword("")
    setShowAdvancedConfig(false)
  }

  const selectedOrg = organizations.find((org) => org.id === formData.organization)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Create a new project</DialogTitle>
          <DialogDescription>
            Your project will have its own dedicated instance and full Postgres database.
            An API will be set up so you can easily interact with your new database.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Organization */}
          <div className="space-y-2">
            <Label>Organization</Label>
            <Select
              value={formData.organization}
              onValueChange={(value) => setFormData({ ...formData, organization: value })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select organization" />
              </SelectTrigger>
              <SelectContent>
                {organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    <div className="flex items-center justify-between w-full gap-4">
                      <span>{org.name}</span>
                      <span className="text-xs text-muted-foreground">{org.plan}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedOrg && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <span>Plan: {selectedOrg.plan}</span>
              </p>
            )}
          </div>

          {/* GitHub Integration */}
          <div className="space-y-2">
            <Label>GitHub (optional)</Label>
            <Button
              type="button"
              variant="outline"
              className={cn(
                "w-full justify-start gap-2",
                formData.githubConnected && "border-green-500 bg-green-50"
              )}
              onClick={() => setFormData({ ...formData, githubConnected: !formData.githubConnected })}
            >
              <Github className="h-4 w-4" />
              {formData.githubConnected ? "Connected to GitHub" : "Connect GitHub"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Ideal for agent-first workflows: update your schema in code, push it to GitHub,
              and Supabase deploys the changes automatically.
            </p>
            {formData.githubConnected && (
              <Input
                placeholder="Repository name (e.g., username/repo)"
                value={formData.githubRepo}
                onChange={(e) => setFormData({ ...formData, githubRepo: e.target.value })}
                className="mt-2"
              />
            )}
          </div>

          {/* Project Name */}
          <div className="space-y-2">
            <Label htmlFor="project-name">Project name</Label>
            <Input
              id="project-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Project name"
              autoFocus
            />
          </div>

          {/* Database Password */}
          <div className="space-y-2">
            <Label htmlFor="db-password">Database password</Label>
            <div className="flex gap-2">
              <Input
                id="db-password"
                type="password"
                value={formData.databasePassword}
                onChange={(e) => setFormData({ ...formData, databasePassword: e.target.value })}
                placeholder="Type in a strong password"
                className="flex-1"
              />
              <Button type="button" variant="outline" onClick={generateStrongPassword} className="gap-1">
                <Sparkles className="h-4 w-4" />
                Generate
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              This is the password to your Postgres database, so it must be strong and hard to guess.
            </p>
            {generatedPassword && (
              <div className="mt-2 p-2 bg-muted rounded-md">
                <p className="text-xs font-mono break-all">{generatedPassword}</p>
              </div>
            )}
          </div>

          {/* Region */}
          <div className="space-y-2">
            <Label>Region</Label>
            <Select
              value={formData.region}
              onValueChange={(value) => setFormData({ ...formData, region: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(
                  regions.reduce((acc, region) => {
                    if (!acc[region.group]) acc[region.group] = []
                    acc[region.group].push(region)
                    return acc
                  }, {} as Record<string, typeof regions>)
                ).map(([group, groupRegions]) => (
                  <div key={group}>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                      {group}
                    </div>
                    {groupRegions.map((region) => (
                      <SelectItem key={region.value} value={region.value}>
                        <div className="flex items-center gap-2">
                          <span>{region.label}</span>
                          {region.recommended && (
                            <span className="text-xs text-green-600">Recommended</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Select the region closest to your users for the best performance.
            </p>
          </div>

          {/* Security Section */}
          <div className="space-y-3">
            <Label>Security</Label>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-normal">Enable Data API</Label>
                <p className="text-xs text-muted-foreground">
                  Autogenerate a RESTful API for your public schema.
                </p>
              </div>
              <Switch
                checked={formData.dataApiEnabled}
                onCheckedChange={(checked: boolean) => setFormData({ ...formData, dataApiEnabled: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-normal">Automatically expose new tables</Label>
                <p className="text-xs text-muted-foreground">
                  Grants privileges to Data API roles by default, exposing new tables.
                </p>
              </div>
              <Switch
                checked={formData.autoExposeTables}
                onCheckedChange={(checked: boolean) => setFormData({ ...formData, autoExposeTables: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-normal">Enable automatic RLS</Label>
                <p className="text-xs text-muted-foreground">
                  Create an event trigger that automatically enables Row Level Security on all new tables.
                </p>
              </div>
              <Switch
                checked={formData.autoRLS}
                onCheckedChange={(checked: boolean) => setFormData({ ...formData, autoRLS: checked })}
              />
            </div>
          </div>

          {/* Advanced Configuration */}
          <div>
            <Button
              type="button"
              variant="ghost"
              className="p-0 h-auto font-medium"
              onClick={() => setShowAdvancedConfig(!showAdvancedConfig)}
            >
              <ChevronDown className={cn("h-4 w-4 mr-1 transition-transform", showAdvancedConfig && "rotate-180")} />
              Advanced Configuration
            </Button>
            <p className="text-xs text-muted-foreground mt-1">
              These settings cannot be changed after the project is created
            </p>

            {showAdvancedConfig && (
              <div className="mt-4 space-y-4 pl-4 border-l-2 border-muted">
                <div className="space-y-2">
                  <Label>Postgres Type</Label>
                  <div className="space-y-2">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="postgresType"
                        value="postgres"
                        checked={formData.postgresType === "postgres"}
                        onChange={() => setFormData({ ...formData, postgresType: "postgres" })}
                        className="mt-1 h-4 w-4"
                      />
                      <div>
                        <div className="font-medium">Postgres</div>
                        <div className="text-xs text-muted-foreground">
                          Default. Recommended for production workloads
                        </div>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="postgresType"
                        value="orioledb"
                        checked={formData.postgresType === "orioledb"}
                        onChange={() => setFormData({ ...formData, postgresType: "orioledb" })}
                        className="mt-1 h-4 w-4"
                      />
                      <div>
                        <div className="font-medium">Postgres with OrioleDB</div>
                        <div className="text-xs text-muted-foreground">
                          Alpha. Not recommended for production workloads
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !formData.name || !formData.databasePassword}>
            {isSubmitting ? "Creating..." : "Create new project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}