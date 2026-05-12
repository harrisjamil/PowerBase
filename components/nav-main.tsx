"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ChevronDownIcon } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

export type NavMainItem = {
  title: string
  url: string
  icon?: React.ReactNode
  items?: { title: string; url: string }[]
}

export function NavMain({ items }: { items: NavMainItem[] }) {
  const pathname = usePathname()
  const router = useRouter()
  const { isMobile } = useSidebar()

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          {items.map((item) => {
            const subItems = item.items
            if (subItems?.length) {
              const isSubActive = subItems.some(
                (sub) =>
                  sub.url !== "#" &&
                  (pathname === sub.url ||
                    pathname.startsWith(`${sub.url}/`))
              )
              return (
                <SidebarMenuItem key={item.title}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuButton
                        title={item.title}
                        isActive={isSubActive}
                        className={cn(
                          isSubActive &&
                            "duration-200 ease-linear data-active:bg-primary data-active:text-primary-foreground data-active:hover:bg-primary/90 data-active:hover:text-primary-foreground data-active:active:bg-primary/90 data-active:active:text-primary-foreground"
                        )}
                      >
                        {item.icon}
                        <span className="truncate">{item.title}</span>
                        <ChevronDownIcon className="ml-auto size-4 shrink-0 opacity-60 group-data-[collapsible=icon]:hidden" />
                      </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      className="w-48 rounded-lg"
                      side={isMobile ? "bottom" : "right"}
                      align={isMobile ? "end" : "start"}
                      sideOffset={4}
                    >
                      {subItems.map((sub) => (
                        <DropdownMenuItem
                          key={sub.title}
                          onSelect={() => {
                            if (sub.url !== "#") {
                              router.push(sub.url)
                            }
                          }}
                        >
                          {sub.title}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              )
            }

            const isRouted = item.url !== "#"
            const isActive =
              isRouted &&
              (pathname === item.url || pathname.startsWith(`${item.url}/`))

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  tooltip={item.title}
                  isActive={isActive}
                  asChild={isRouted}
                  className={cn(
                    isRouted &&
                      isActive &&
                      "duration-200 ease-linear data-active:bg-primary data-active:text-primary-foreground data-active:hover:bg-primary/90 data-active:hover:text-primary-foreground data-active:active:bg-primary/90 data-active:active:text-primary-foreground"
                  )}
                >
                  {isRouted ? (
                    <Link href={item.url}>
                      {item.icon}
                      <span>{item.title}</span>
                    </Link>
                  ) : (
                    <>
                      {item.icon}
                      <span>{item.title}</span>
                    </>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
