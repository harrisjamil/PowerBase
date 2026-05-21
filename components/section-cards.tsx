"use client"

import Link from "next/link"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { AdminDashboardStats } from "@/lib/admin-dashboard"
import {
  DatabaseIcon,
  FolderKanbanIcon,
  HardDriveIcon,
  LibraryIcon,
  UsersIcon,
  UserRoundIcon,
} from "lucide-react"

const emptyStats: AdminDashboardStats = {
  projects: 0,
  activeProjects: 0,
  schemas: 0,
  teams: 0,
  dbUsers: 0,
  agents: 0,
  libraryAssets: 0,
  totalTables: 0,
  dbSizeBytes: 0,
  dbSizePretty: "—",
  activeConnections: 0,
}

type SectionCardsProps = {
  stats?: AdminDashboardStats
}

export function SectionCards({ stats = emptyStats }: SectionCardsProps) {
  const cards = [
    {
      label: "VM Projects",
      value: stats.projects,
      hint: `${stats.activeProjects} active`,
      href: "/admin/vm/projects",
      icon: FolderKanbanIcon,
    },
    {
      label: "Schemas",
      value: stats.schemas,
      hint: `${stats.totalTables} tables`,
      href: "/admin/schemas",
      icon: DatabaseIcon,
    },
    {
      label: "Teams",
      value: stats.teams,
      hint: "Collaboration groups",
      href: "/admin/team",
      icon: UsersIcon,
    },
    {
      label: "DB Users",
      value: stats.dbUsers,
      hint: "Managed logins",
      href: "/admin/admin",
      icon: UserRoundIcon,
    },
    {
      label: "Library",
      value: stats.libraryAssets,
      hint: "Catalog entries",
      href: "/admin/data-library",
      icon: LibraryIcon,
    },
    {
      label: "Database",
      value: stats.dbSizePretty,
      hint: `${stats.activeConnections} connections`,
      href: "/admin/vm",
      icon: HardDriveIcon,
    },
  ] as const

  return (
    <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {cards.map((card) => (
        <Link key={card.href} href={card.href}>
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardDescription>{card.label}</CardDescription>
                <card.icon className="size-4 text-muted-foreground" />
              </div>
              <CardTitle className="text-2xl font-semibold tabular-nums">{card.value}</CardTitle>
            </CardHeader>
            <CardFooter className="text-sm text-muted-foreground">{card.hint}</CardFooter>
          </Card>
        </Link>
      ))}
    </div>
  )
}