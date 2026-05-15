"use client"

import { useMemo, useState } from "react"
import { Database, FolderKanban, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { buildProjectSchemaName } from "@/lib/project-names"

export type ProjectFormData = {
  name: string
  schemaName: string
  assignedRoleNames: string[]
}

export type ProjectPgUser = {
  oid: number
  username: string
  canLogin: boolean
  isSystemRole: boolean
}

type ProjectSetupFormProps = {
  onCancel?: () => void
  onSubmit: (data: ProjectFormData) => Promise<void>
  pgUsers?: ProjectPgUser[]
  creatorRoleName?: string | null
  isSubmitting?: boolean
  submitLabel?: string
}

export function ProjectSetupForm({
  onCancel,
  onSubmit,
  pgUsers = [],
  creatorRoleName,
  isSubmitting = false,
  submitLabel = "Create project",
}: ProjectSetupFormProps) {
  const [name, setName] = useState("")
  const [selectedRoleNames, setSelectedRoleNames] = useState<string[]>([])
  const schemaName = useMemo(() => buildProjectSchemaName(name), [name])
  const assignableUsers = useMemo(
    () =>
      pgUsers.filter(
        (user) => user.canLogin && (!creatorRoleName || user.username !== creatorRoleName)
      ),
    [creatorRoleName, pgUsers]
  )

  const toggleRole = (roleName: string, checked: boolean) => {
    setSelectedRoleNames((current) => {
      const next = new Set(current)
      if (checked) {
        next.add(roleName)
      } else {
        next.delete(roleName)
      }
      return Array.from(next).sort((left, right) => left.localeCompare(right))
    })
  }

  const handleSubmit = async () => {
    if (!name.trim() || !schemaName) {
      return
    }

    await onSubmit({
      name: name.trim(),
      schemaName,
      assignedRoleNames: selectedRoleNames,
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
            Create a project schema, assign PostgreSQL users to it, and keep the creator assigned automatically.
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
            This schema will be created automatically in PostgreSQL from the project name.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Project creator</Label>
          {creatorRoleName ? (
            <div className="flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4" />
              <span className="font-medium text-foreground">{creatorRoleName}</span>
              is always assigned to this project and will always keep access.
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              The current admin will be assigned automatically when the project is created.
            </p>
          )}
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Assign PostgreSQL users</Label>
            <p className="text-xs text-muted-foreground">
              Only these PostgreSQL login users, plus the creator, will receive access to the new schema.
            </p>
          </div>

          {assignableUsers.length > 0 ? (
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border p-3">
              {assignableUsers.map((user) => (
                <label
                  key={user.oid}
                  htmlFor={`project-role-${user.oid}`}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2"
                >
                  <Checkbox
                    id={`project-role-${user.oid}`}
                    checked={selectedRoleNames.includes(user.username)}
                    onCheckedChange={(checked) => toggleRole(user.username, checked === true)}
                    disabled={isSubmitting}
                    className="mt-0.5"
                  />
                  <div className="space-y-1">
                    <div className="font-medium">{user.username}</div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{user.isSystemRole ? "System role" : "Custom role"}</span>
                      <span>LOGIN enabled</span>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No login-enabled PostgreSQL users are available to assign yet.
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
            disabled={isSubmitting || !name.trim() || !schemaName}
          >
            {isSubmitting ? "Creating..." : submitLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
