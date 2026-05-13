"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export type AgentFormData = {
  email: string
  password: string
}

interface AgentFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: AgentFormData) => void
  initialData?: Omit<AgentFormData, "password"> | null
  isEditing?: boolean
  submitting?: boolean
}

export function AgentFormDialog({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  isEditing = false,
  submitting = false,
}: AgentFormDialogProps) {
  const [form, setForm] = useState<AgentFormData>(() => ({
    email: initialData?.email ?? "",
    password: "",
  }))

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    onSubmit(form)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Agent" : "Create New Agent"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the agent email or set a new password."
              : "Create a new agent login using email and password."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter email address"
                value={form.email}
                onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
                required
                disabled={submitting}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">{isEditing ? "New Password" : "Password"}</Label>
              <Input
                id="password"
                type="password"
                placeholder={isEditing ? "Leave blank to keep current password" : "Set password"}
                value={form.password}
                onChange={(e) => setForm((current) => ({ ...current, password: e.target.value }))}
                required={!isEditing}
                disabled={submitting}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : isEditing ? "Save Changes" : "Create Agent"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}