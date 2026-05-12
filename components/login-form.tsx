"use client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(true) // Start with loading true

  // Check if user is already logged in on component mount
  useEffect(() => {
    const checkAuth = () => {
      const user = localStorage.getItem('user')
      const token = localStorage.getItem('authToken')
      const isLoggedIn = localStorage.getItem('isLoggedIn')
      
      // Check all authentication criteria
      if (user && (token || isLoggedIn === "true")) {
        // User is already logged in, redirect to dashboard
        router.replace('/admin/dashboard') // Use replace instead of push
      }
      setIsLoading(false)
    }
    
    checkAuth()
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)
  
    if (!email || !password) {
      setError("Please fill in all fields")
      setIsLoading(false)
      return
    }
  
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      })
  
      const data = await response.json()
  
      if (!response.ok) {
        setError(data.error || "Login failed")
        setIsLoading(false)
        return
      }
  
      // Store both user and token (if returned from backend)
      localStorage.setItem("user", JSON.stringify(data.user))
      localStorage.setItem("isLoggedIn", "true")
      
      // Store token if your backend returns one
      if (data.token) {
        localStorage.setItem("authToken", data.token)
      }
  
      // Use replace to prevent back button issues
      router.replace("/admin/dashboard")
  
    } catch (err) {
      setError("Server error. Please try again.")
      setIsLoading(false)
    }
  }

  // Show nothing while checking authentication
  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center">Loading...</div>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>Login to your account</CardTitle>
          <CardDescription>
            Enter your email below to login to your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                />
              </Field>
              <Field>
                <div className="flex items-center">
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                </div>
                <Input 
                  id="password" 
                  type="password" 
                  placeholder="Enter your password" 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                />
              </Field>
              {error && (
                <div className="text-sm text-red-500 mt-2">{error}</div>
              )}
              <Field>
              <Button 
                type="submit" 
                disabled={isLoading}
                className={!isLoading ? "cursor-pointer" : ""}
              >
                {isLoading ? "Logging in..." : "Login"}
              </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}