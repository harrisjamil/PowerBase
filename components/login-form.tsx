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
import { useState } from "react"

export function LoginForm({
  className,
  title = "Login to your account",
  description = "Enter your email below to login to your account",
  submitLabel = "Login",
  loadingLabel = "Logging in...",
  loginPath = "/api/login",
  successRedirect = "/admin/dashboard",
  ...props
}: React.ComponentProps<"div"> & {
  title?: string
  description?: string
  submitLabel?: string
  loadingLabel?: string
  loginPath?: string
  successRedirect?: string
}) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

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
      const response = await fetch(loginPath, {
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
  
      router.replace(successRedirect)
      router.refresh()
  
    } catch {
      setError("Server error. Please try again.")
      setIsLoading(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
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
                {isLoading ? loadingLabel : submitLabel}
              </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}