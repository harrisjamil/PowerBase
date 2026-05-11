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
  const [isLoading, setIsLoading] = useState(false)

  // Check if user is already logged in on component mount
  useEffect(() => {
    const checkAuth = () => {
      const user = localStorage.getItem('user')
      const token = localStorage.getItem('authToken')
      
      if (user && token) {
        // User is already logged in, redirect to dashboard
        router.push('/admin/dashboard')
      }
    }
    
    checkAuth()
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)
    
    // Basic validation
    if (!email || !password) {
      setError("Please fill in all fields")
      setIsLoading(false)
      return
    }

    try {
      // Example authentication check (replace with your actual auth logic)
      // For demo purposes, we'll accept any non-empty email/password
      // In production, replace this with your actual API call
      
      /*
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      
      if (!response.ok) {
        throw new Error('Invalid credentials')
      }
      
      const data = await response.json()
      */
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Store user data in localStorage
      const userData = {
        email: email,
        name: email.split('@')[0], // Extract name from email
        loginTime: new Date().toISOString(),
        role: 'admin' // Add role if needed
      }
      
      // Generate a simple token (in production, use the token from your backend)
      const token = btoa(`${email}:${Date.now()}`) // Simple encoding for demo
      
      localStorage.setItem('user', JSON.stringify(userData))
      localStorage.setItem('authToken', token)
      localStorage.setItem('isLoggedIn', 'true')
      
      // Redirect to dashboard
      router.push('/admin/dashboard')
      
    } catch (err) {
      setError("Invalid email or password. Please try again.")
    } finally {
      setIsLoading(false)
    }
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