"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  ChevronDown,
  FolderGit2,
  LayoutDashboard,
  LogOut,
  Moon,
  Shield,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

type ClientSessionUser = {
  id: number;
  username: string;
  controlSchema: string;
};

type SessionResponse = {
  success: boolean;
  user?: ClientSessionUser;
  error?: string;
};

type ProjectsResponse = {
  success: boolean;
  count?: number;
  error?: string;
};

function getInitials(value: string) {
  const cleaned = value
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (cleaned.length === 0) {
    return "PB";
  }

  return cleaned
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function subscribeToTheme(callback: () => void) {
  if (typeof document === "undefined") {
    return () => {};
  }

  const observer = new MutationObserver(() => callback());
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });

  return () => observer.disconnect();
}

function getThemeSnapshot() {
  if (typeof document === "undefined") {
    return false;
  }

  return document.documentElement.classList.contains("dark");
}

export function Navbar() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [user, setUser] = useState<ClientSessionUser | null>(null);
  const [projectCount, setProjectCount] = useState(0);
  const isDarkMode = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, () => false);

  useEffect(() => {
    let cancelled = false;

    const loadNavbarData = async () => {
      try {
        const [sessionResponse, projectsResponse] = await Promise.all([
          fetch("/api/db-users/session", { cache: "no-store" }),
          fetch("/api/projects", { cache: "no-store" }),
        ]);

        const sessionResult = (await sessionResponse.json()) as SessionResponse;
        const projectsResult = (await projectsResponse.json()) as ProjectsResponse;

        if (cancelled) {
          return;
        }

        if (sessionResponse.ok && sessionResult.success && sessionResult.user) {
          setUser(sessionResult.user);
        }

        if (
          projectsResponse.ok &&
          projectsResult.success &&
          typeof projectsResult.count === "number"
        ) {
          setProjectCount(projectsResult.count);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          setProjectCount(0);
        }
      }
    };

    void loadNavbarData();

    return () => {
      cancelled = true;
    };
  }, []);

  const toggleDarkMode = () => {
    document.documentElement.classList.toggle("dark");
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/db-users/logout", { method: "POST" });
    } finally {
      router.replace("/client/login");
      router.refresh();
      setLoggingOut(false);
    }
  };

  const username = user?.username ?? "Client";
  const projectLabel = useMemo(() => {
    return `${projectCount} assigned project${projectCount === 1 ? "" : "s"}`;
  }, [projectCount]);

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:border-gray-800 dark:bg-gray-950/95">
      <div className="flex h-16 items-center px-4 md:px-6">
        <Link href="/client/dashboard" className="mr-6 flex items-center space-x-2">
          <span className="bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-xl font-bold tracking-tight text-transparent dark:from-white dark:to-gray-400">
            PowerBase
          </span>
          <Badge variant="outline" className="ml-2 hidden text-[10px] sm:inline-flex">
            Client
          </Badge>
        </Link>

        <div className="hidden items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 shadow-sm md:flex dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
          <FolderGit2 className="h-3.5 w-3.5" />
          <span>{projectLabel}</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleDarkMode}
            className="h-9 w-9 rounded-full text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
          >
            {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          <Separator orientation="vertical" className="hidden h-6 sm:block" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative h-9 gap-2 rounded-full px-2 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-500 text-xs text-white">
                    {getInitials(username)}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden flex-col items-start text-left lg:flex">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {username}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Database User
                  </span>
                </div>
                <ChevronDown className="hidden h-4 w-4 text-gray-500 lg:block" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent className="w-64" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{username}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      Database User
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {projectLabel}
                    </Badge>
                    {user?.controlSchema ? (
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <Shield className="h-3 w-3" />
                        {user.controlSchema}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                  <Link href="/client/dashboard" className="cursor-pointer">
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    <span>Dashboard</span>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  void handleLogout();
                }}
                className="cursor-pointer text-red-600 focus:text-red-700"
                disabled={loggingOut}
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>{loggingOut ? "Logging out..." : "Log out"}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full md:hidden">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </Button>
            </SheetTrigger>

            <SheetContent side="left" className="w-[280px] sm:w-[350px]">
              <SheetHeader className="text-left">
                <SheetTitle className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600">
                    <span className="text-xs font-bold text-white">PB</span>
                  </div>
                  <span>PowerBase</span>
                </SheetTitle>
                <SheetDescription>Access the real projects assigned to your user.</SheetDescription>
              </SheetHeader>

              <Separator className="my-4" />

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{username}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Database User</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {projectLabel}
                  </Badge>
                  {user?.controlSchema ? (
                    <Badge variant="outline" className="text-[10px]">
                      {user.controlSchema}
                    </Badge>
                  ) : null}
                </div>
              </div>

              <Separator className="my-4" />

              <div className="flex flex-col gap-1">
                <Link
                  href="/client/dashboard"
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </Link>
              </div>

              <Separator className="my-4" />

              <Button
                variant="ghost"
                onClick={() => void handleLogout()}
                className="w-full justify-start gap-3 px-3 text-red-600 hover:bg-red-50 hover:text-red-700"
                disabled={loggingOut}
              >
                <LogOut className="h-4 w-4" />
                {loggingOut ? "Logging out..." : "Log out"}
              </Button>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}