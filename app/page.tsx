"use client"
import PageLoader from "@/components/page-loader"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

export default function HomePage() {
  const router = useRouter()

  useEffect(() => {
    const isLoggedIn = localStorage.getItem("isLoggedIn")
    const token = localStorage.getItem("authToken")

    if (isLoggedIn === "true" && token) {
      router.push("/admin/dashboard")
    } else {
      router.push("/admin/login")
    }
  }, [router])

  return <PageLoader message="Redirecting…" />
}