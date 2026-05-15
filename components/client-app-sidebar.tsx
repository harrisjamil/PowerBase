"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, usePathname } from "next/navigation"
import { NavMain, type NavMainItem } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { ClientNavUser } from "@/components/client-nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  CommandIcon,
  DatabaseIcon,
  FolderKanbanIcon,
  HardDriveIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  Settings2Icon,
  Table2Icon,
  TerminalIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"

type ClientAppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  currentUser: {
    name: string
    email: string
    avatar?: string
  }
  project?: {
    name: string
    schema_name: string
    status: string
  } | null
}

function buildProjectNavItems(projectId: string): NavMainItem[] {
  const base = `/client/projects/${projectId}`
  return [
    {
      title: "Overview",
      url: `${base}/overview`,
      icon: <LayoutDashboardIcon />,
    },
    {
      title: "Table Editor",
      url: `${base}/table-editor`,
      icon: <Table2Icon />,
    },
    {
      title: "SQL Editor",
      url: `${base}/sql-editor`,
      icon: <TerminalIcon />,
    },
    {
      title: "Database",
      url: `${base}/database`,
      icon: <DatabaseIcon />,
    },
    {
      title: "Authentication",
      url: `${base}/authentication`,
      icon: <KeyRoundIcon />,
    },
    {
      title: "Storage",
      url: `${base}/storage`,
      icon: <HardDriveIcon />,
    },
    {
      title: "Settings",
      url: `${base}/project-settings`,
      icon: <Settings2Icon />,
    },
  ]
}

export function ClientAppSidebar({
  currentUser,
  project,
  ...props
}: ClientAppSidebarProps) {
  const pathname = usePathname()
  const params = useParams()
  const projectId = typeof params?.id === "string" ? params.id : null
  const inProject =
    Boolean(projectId) && pathname.startsWith(`/client/projects/${projectId}`)

  const navMain = React.useMemo<NavMainItem[]>(
    () => [
      {
        title: "Projects",
        url: "/client/dashboard",
        icon: <FolderKanbanIcon />,
      },
    ],
    []
  )

  const projectNavItems = React.useMemo(
    () => (projectId ? buildProjectNavItems(projectId) : []),
    [projectId]
  )

  const navSecondary = React.useMemo(
    () =>
      inProject
        ? [
            {
              title: "All projects",
              url: "/client/dashboard",
              icon: <LayoutDashboardIcon />,
            },
          ]
        : [],
    [inProject]
  )

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <Link href="/client/dashboard">
                <CommandIcon className="size-5!" />
                <span className="text-base font-semibold">PowerBuddy</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {inProject && project ? (
          <SidebarGroup className="py-0">
            <SidebarGroupContent className="px-2 pb-2">
              <div className="rounded-lg border bg-sidebar-accent/40 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{project.name}</span>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {project.status}
                  </Badge>
                </div>
                <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                  {project.schema_name}
                </p>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        {inProject && projectId ? (
          <SidebarGroup>
            <SidebarGroupLabel>Project</SidebarGroupLabel>
            <SidebarGroupContent>
              <NavMain items={projectNavItems} />
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
        {navSecondary.length > 0 ? (
          <NavSecondary items={navSecondary} className="mt-auto" />
        ) : null}
      </SidebarContent>
      <SidebarFooter>
        <ClientNavUser user={currentUser} />
      </SidebarFooter>
    </Sidebar>
  )
}
