export type VmProjectStatus = "active" | "archived" | "draft"

export type VmProject = {
  id: string
  name: string
  schemaName: string
  description: string | null
  status: VmProjectStatus
  created_at: string
  updated_at: string
  owner: string
  member_count: number
  region?: string
  postgresType?: string
}

export type VmProjectStats = {
  total: number
  active: number
  archived: number
  draft: number
}

export type CreateVmProjectInput = {
  name: string
  description: string
  region: string
  postgresType: "postgres" | "orioledb"
}

const STORAGE_KEY = "powerbase.vm.projects"

const DEFAULT_PROJECTS: VmProject[] = [
  {
    id: "1",
    name: "E-commerce Platform",
    schemaName: "E-commerce Platform",
    description: "Main online store with payment integration and inventory management",
    status: "active",
    created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    owner: "alice@example.com",
    member_count: 5,
    region: "us-east-1",
    postgresType: "postgres",
  },
  {
    id: "2",
    name: "Analytics Dashboard",
    schemaName: "Analytics Dashboard",
    description: "Real-time business intelligence and reporting dashboard",
    status: "active",
    created_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    owner: "bob@example.com",
    member_count: 3,
    region: "eu-west-1",
    postgresType: "postgres",
  },
  {
    id: "3",
    name: "Mobile App Backend",
    schemaName: "Mobile App Backend",
    description: "API services for iOS and Android applications",
    status: "draft",
    created_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    owner: "alice@example.com",
    member_count: 2,
    region: "ap-southeast-1",
    postgresType: "postgres",
  },
  {
    id: "4",
    name: "Legacy CRM",
    schemaName: "Legacy CRM",
    description: "Customer relationship management system (deprecated)",
    status: "archived",
    created_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
    owner: "carol@example.com",
    member_count: 0,
    region: "eu-central-1",
    postgresType: "postgres",
  },
]

export function loadVmProjects(): VmProject[] {
  if (typeof window === "undefined") {
    return DEFAULT_PROJECTS
  }

  const storedProjects = window.localStorage.getItem(STORAGE_KEY)
  if (!storedProjects) {
    return DEFAULT_PROJECTS
  }

  try {
    const parsed = JSON.parse(storedProjects)
    return Array.isArray(parsed) ? (parsed as VmProject[]) : DEFAULT_PROJECTS
  } catch {
    return DEFAULT_PROJECTS
  }
}

export function saveVmProjects(projects: VmProject[]) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
}

export function createVmProject(input: CreateVmProjectInput): VmProject {
  const now = new Date().toISOString()

  return {
    id: String(Date.now()),
    name: input.name.trim(),
    schemaName: input.name.trim(),
    description: input.description.trim() || null,
    status: "active",
    created_at: now,
    updated_at: now,
    owner: "current@user.com",
    member_count: 1,
    region: input.region,
    postgresType: input.postgresType,
  }
}

export function getVmProjectStats(projects: VmProject[]): VmProjectStats {
  return projects.reduce(
    (stats, project) => {
      stats.total += 1
      stats[project.status] += 1
      return stats
    },
    {
      total: 0,
      active: 0,
      archived: 0,
      draft: 0,
    }
  )
}
