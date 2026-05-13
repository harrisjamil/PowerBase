"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, Plus, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { AgentFormDialog, AgentFormData } from "@/components/agents/agent-form-dialog"
import { DeleteConfirmationDialog } from "@/components/agents/delete-confirmation-dialog"
import { AgentsTable, Agent } from "@/components/agents/agents-table"

type AgentsResponse = {
  success: boolean
  agents?: Agent[]
  count?: number
  error?: string
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)
  const [deletingAgentId, setDeletingAgentId] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const requestAgents = async (): Promise<AgentsResponse> => {
    const res = await fetch("/api/agents")
    const data = (await res.json()) as AgentsResponse
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Failed to fetch agents")
    }
    return data
  }

  const refreshAgents = async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true)
    try {
      const data = await requestAgents()
      setAgents(data.agents ?? [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to fetch agents")
    } finally {
      if (showRefreshing) setRefreshing(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await requestAgents()
        if (!cancelled) {
          setAgents(data.agents ?? [])
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Failed to fetch agents")
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
  }, [])

  const handleEdit = (agent: Agent) => {
    setEditingAgent(agent)
    setIsFormDialogOpen(true)
  }

  const handleDelete = (id: number) => {
    setDeletingAgentId(id)
    setIsDeleteDialogOpen(true)
  }

  const handleFormSubmit = async (data: AgentFormData) => {
    const email = data.email.trim().toLowerCase()

    if (!email) {
      toast.error("Email is required.")
      return
    }
    if (!editingAgent && !data.password) {
      toast.error("Password is required when creating an agent.")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/agents", {
        method: editingAgent ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingAgent?.id,
          email,
          password: data.password,
        }),
      })
      const result = (await res.json()) as { success?: boolean; error?: string }
      if (!res.ok || !result.success) {
        throw new Error(result.error || `Failed to ${editingAgent ? "update" : "create"} agent`)
      }

      toast.success(
        editingAgent ? `Agent ${email} updated.` : `Agent ${email} created successfully.`
      )
      setIsFormDialogOpen(false)
      setEditingAgent(null)
      await refreshAgents()
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Failed to ${editingAgent ? "update" : "create"} agent`
      )
    } finally {
      setSubmitting(false)
    }
  }

  const openCreateDialog = () => {
    setEditingAgent(null)
    setIsFormDialogOpen(true)
  }

  const handleDeleteAgent = async () => {
    if (!deletingAgentId) return

    setSubmitting(true)
    try {
      const res = await fetch(`/api/agents?id=${encodeURIComponent(String(deletingAgentId))}`, {
        method: "DELETE",
      })
      const result = (await res.json()) as { success?: boolean; error?: string }
      if (!res.ok || !result.success) {
        throw new Error(result.error || "Failed to delete agent")
      }

      toast.success("Agent deleted successfully.")
      setIsDeleteDialogOpen(false)
      setDeletingAgentId(null)
      await refreshAgents()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete agent")
    } finally {
      setSubmitting(false)
    }
  }

  const getAgentNameForDelete = () => {
    const agent = agents.find((item) => item.id === deletingAgentId)
    return agent?.email
  }

  const totalAgents = useMemo(() => agents.length, [agents])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Agents</h1>
          <p className="text-sm text-muted-foreground">
            Manage agent logins from the `seung_control.agents` table. Total agents: {totalAgents}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={openCreateDialog} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Agent
          </Button>
          <Button
            onClick={() => void refreshAgents(true)}
            disabled={refreshing}
            variant="outline"
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
      </div>

      <AgentsTable
        agents={agents}
        onEdit={handleEdit}
        onDelete={handleDelete}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
      />

      <AgentFormDialog
        key={isFormDialogOpen ? editingAgent?.id ?? "create" : "closed"}
        open={isFormDialogOpen}
        onOpenChange={setIsFormDialogOpen}
        onSubmit={handleFormSubmit}
        initialData={editingAgent}
        isEditing={!!editingAgent}
        submitting={submitting}
      />

      <DeleteConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={handleDeleteAgent}
        title="Delete Agent"
        description="This action cannot be undone. This will permanently delete the agent and remove their data from the system."
        itemName={getAgentNameForDelete()}
        confirming={submitting}
      />
    </div>
  )
}