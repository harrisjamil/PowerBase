"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { 
  Settings, 
  Users, 
  Bell, 
  Database, 
  Shield, 
  Key, 
  MessageSquare,
  LayoutDashboard
} from "lucide-react"

const settingsNav = [
  { 
    id: "general", 
    label: "General", 
    icon: Settings,
    href: "/admin/settings/general"
  },
  { 
    id: "integrations", 
    label: "Integrations", 
    icon: Database,
    href: "/admin/settings/integrations"
  },
  { 
    id: "data-privacy", 
    label: "Data privacy", 
    icon: Shield,
    href: "/admin/settings/data-privacy"
  },
  { 
    id: "users-permissions", 
    label: "Users and permissions", 
    icon: Users,
    href: "/admin/settings/users-permissions"
  },
]

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/dashboard" className="hover:opacity-80">
            <LayoutDashboard className="h-5 w-5 text-muted-foreground" />
          </Link>
          <span className="text-muted-foreground">/</span>
          <Settings className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Project settings</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 border-r border-border bg-card overflow-y-auto">
          <nav className="p-4 space-y-1">
            {settingsNav.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  replace={false} // Don't replace, push new entry
                  scroll={false} // Don't scroll to top
                  prefetch={true} // Prefetch for faster navigation
                  className={`flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>

        {/* Page Content - This should update without refresh */}
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </div>
    </div>
  )
}