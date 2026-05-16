export type CatalogIntegration = {
  id: string
  name: string
  description: string
  category: string
  icon: string
  type: "oauth" | "api_key" | "webhook"
  popular: boolean
}

export const INTEGRATION_CATALOG: CatalogIntegration[] = [
  {
    id: "slack",
    name: "Slack",
    description: "Send notifications and alerts to Slack channels",
    category: "Communication",
    icon: "slack",
    type: "oauth",
    popular: true,
  },
  {
    id: "github",
    name: "GitHub",
    description: "Sync code repositories and automate deployments",
    category: "Development",
    icon: "github",
    type: "oauth",
    popular: true,
  },
  {
    id: "gmail",
    name: "Gmail",
    description: "Send emails and manage communications",
    category: "Communication",
    icon: "gmail",
    type: "oauth",
    popular: false,
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    description: "Connect to PostgreSQL databases",
    category: "Database",
    icon: "postgres",
    type: "api_key",
    popular: true,
  },
  {
    id: "mongodb",
    name: "MongoDB",
    description: "Connect to MongoDB databases",
    category: "Database",
    icon: "mongodb",
    type: "api_key",
    popular: false,
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Process payments and manage subscriptions",
    category: "Payment",
    icon: "stripe",
    type: "api_key",
    popular: true,
  },
  {
    id: "notion",
    name: "Notion",
    description: "Sync data with Notion databases",
    category: "Productivity",
    icon: "notion",
    type: "oauth",
    popular: false,
  },
  {
    id: "google_calendar",
    name: "Google Calendar",
    description: "Sync events and schedules",
    category: "Productivity",
    icon: "google_calendar",
    type: "oauth",
    popular: false,
  },
]

export function getCatalogIntegration(providerId: string): CatalogIntegration | undefined {
  return INTEGRATION_CATALOG.find((item) => item.id === providerId)
}
