"use client"

import { useMemo, useState } from "react"
import { Database, FolderKanban, UserRound } from "lucide-react"
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

export type ProjectFormData = {
  name: string
  schemaName: string
  ownerSuperadminId: number
}

export type ProjectSuperadmin = {
  id: string
  email: string
}

type ProjectSetupFormProps = {
  onCancel?: () => void
  onSubmit: (data: ProjectFormData) => Promise<void>
  superadmins?: ProjectSuperadmin[]
  isSubmitting?: boolean
  submitLabel?: string
}

function buildSchemaName(name: string) {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")

  if (!normalized) {
    return ""
  }

  const safeName = /^\d/.test(normalized) ? `project_${normalized}` : normalized
  return safeName.slice(0, 63).replace(/_+$/g, "")
}

export function ProjectSetupForm({
  onCancel,
  onSubmit,
  superadmins = [],
  isSubmitting = false,
  submitLabel = "Create project",
}: ProjectSetupFormProps) {
  const [name, setName] = useState("")
  const [ownerSuperadminId, setOwnerSuperadminId] = useState(superadmins[0]?.id ?? "")
  const schemaName = useMemo(() => buildSchemaName(name), [name])
  const resolvedOwnerSuperadminId = ownerSuperadminId || superadmins[0]?.id || ""
  const selectedSuperadmin =
    superadmins.find((user) => user.id === resolvedOwnerSuperadminId) ?? null

  const handleSubmit = async () => {
    if (!name.trim() || !schemaName || !resolvedOwnerSuperadminId) {
      return
    }

    await onSubmit({
      name: name.trim(),
      schemaName,
      ownerSuperadminId: Number(resolvedOwnerSuperadminId),
    })
  }

  return (
    <div className="mx-auto w-full max-w-2xl rounded-2xl border bg-background p-6 shadow-sm">
      <div className="mb-6 flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2 text-primary">
          <FolderKanban className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold">Project details</h3>
          <p className="text-sm text-muted-foreground">
            Create a project schema and assign exactly one superadmin owner.
          </p>
        </div>
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="project-name">Project name</Label>
          <Input
            id="project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Sales CRM"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            The schema name is generated automatically from the project name.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="project-schema">Schema name</Label>
          <div className="relative">
            <Database className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="project-schema"
              value={schemaName}
              readOnly
              placeholder="schema_name"
              className="pl-9 font-mono"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            This schema will be created in Postgres and linked to the selected superadmin.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Schema owner superadmin</Label>
          <Select value={resolvedOwnerSuperadminId} onValueChange={setOwnerSuperadminId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a superadmin" />
            </SelectTrigger>
            <SelectContent>
              {superadmins.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedSuperadmin ? (
            <div className="flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              <UserRound className="h-4 w-4" />
              Only <span className="font-medium text-foreground">{selectedSuperadmin.email}</span> will
              see this assigned schema.
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Create at least one superadmin first if the list is empty.
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          {onCancel ? (
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !name.trim() || !schemaName || !resolvedOwnerSuperadminId}
          >
            {isSubmitting ? "Creating..." : submitLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
