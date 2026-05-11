"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AgentFormDialog, AgentFormData } from "@/components/agents/agent-form-dialog"
import { DeleteConfirmationDialog } from "@/components/agents/delete-confirmation-dialog"
import { AgentsTable, Agent } from "@/components/agents/agents-table"

// Mock data for agents
const initialAgents: Agent[] = [
  {
    id: 1,
    name: "John Doe",
    email: "john.doe@example.com",
    phone: "+1 234 567 8900",
    status: "active",
    department: "Sales",
    joinDate: "2024-01-15",
  },
  {
    id: 2,
    name: "Jane Smith",
    email: "jane.smith@example.com",
    phone: "+1 234 567 8901",
    status: "active",
    department: "Support",
    joinDate: "2024-02-20",
  },
  {
    id: 3,
    name: "Mike Johnson",
    email: "mike.johnson@example.com",
    phone: "+1 234 567 8902",
    status: "inactive",
    department: "Sales",
    joinDate: "2024-01-10",
  },
  {
    id: 4,
    name: "Sarah Williams",
    email: "sarah.williams@example.com",
    phone: "+1 234 567 8903",
    status: "active",
    department: "Technical",
    joinDate: "2024-03-05",
  },
]

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>(initialAgents)
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)
  const [deletingAgentId, setDeletingAgentId] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState("")

  const handleCreateAgent = (data: AgentFormData) => {
    const newAgent: Agent = {
      id: Math.max(0, ...agents.map((a) => a.id)) + 1,
      ...data,
      joinDate: new Date().toISOString().split("T")[0],
    }
    setAgents([...agents, newAgent])
  }

  const handleUpdateAgent = (data: AgentFormData) => {
    if (editingAgent) {
      const updatedAgents = agents.map((agent) =>
        agent.id === editingAgent.id
          ? { ...agent, ...data }
          : agent
      )
      setAgents(updatedAgents)
      setEditingAgent(null)
    }
  }

  const handleDeleteAgent = () => {
    if (deletingAgentId) {
      setAgents(agents.filter((agent) => agent.id !== deletingAgentId))
      setDeletingAgentId(null)
    }
  }

  const handleEdit = (agent: Agent) => {
    setEditingAgent(agent)
    setIsFormDialogOpen(true)
  }

  const handleDelete = (id: number) => {
    setDeletingAgentId(id)
    setIsDeleteDialogOpen(true)
  }

  const handleFormSubmit = (data: AgentFormData) => {
    if (editingAgent) {
      handleUpdateAgent(data)
    } else {
      handleCreateAgent(data)
    }
    setIsFormDialogOpen(false)
    setEditingAgent(null)
  }

  const openCreateDialog = () => {
    setEditingAgent(null)
    setIsFormDialogOpen(true)
  }

  const getAgentNameForDelete = () => {
    const agent = agents.find(a => a.id === deletingAgentId)
    return agent?.name
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Agents</h1>
          <p className="text-sm text-muted-foreground">
            Manage agents from this section. Total agents: {agents.length}
          </p>
        </div>
        <Button onClick={openCreateDialog} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Agent
        </Button>
      </div>

      <AgentsTable
        agents={agents}
        onEdit={handleEdit}
        onDelete={handleDelete}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
      />

      <AgentFormDialog
        open={isFormDialogOpen}
        onOpenChange={setIsFormDialogOpen}
        onSubmit={handleFormSubmit}
        initialData={editingAgent}
        isEditing={!!editingAgent}
      />

      <DeleteConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={handleDeleteAgent}
        title="Delete Agent"
        description="This action cannot be undone. This will permanently delete the agent and remove their data from the system."
        itemName={getAgentNameForDelete()}
      />
    </div>
  )
}