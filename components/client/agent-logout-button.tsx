"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"

export function AgentLogoutButton() {
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await fetch("/api/agents/logout", { method: "POST" })
    } finally {
      router.replace("/client/login")
      router.refresh()
      setLoggingOut(false)
    }
  }

  return (
    <Button variant="outline" onClick={() => void handleLogout()} disabled={loggingOut}>
      {loggingOut ? "Logging out..." : "Log out"}
    </Button>
  )
}
