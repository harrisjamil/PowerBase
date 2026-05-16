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
import { useState, useRef, useEffect } from "react"

export function LoginForm({
  className,
  title = "Login to your account",
  description = "Enter your email below to login to your account",
  submitLabel = "Login",
  loadingLabel = "Logging in...",
  identifierLabel = "Email",
  identifierPlaceholder = "Enter your email",
  identifierKey = "email",
  loginPath = "/api/login",
  successRedirect = "/admin/dashboard",
  ...props
}: React.ComponentProps<"div"> & {
  title?: string
  description?: string
  submitLabel?: string
  loadingLabel?: string
  identifierLabel?: string
  identifierPlaceholder?: string
  identifierKey?: "email" | "username"
  loginPath?: string
  successRedirect?: string
}) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [totpCode, setTotpCode] = useState(["", "", "", "", "", ""])
  const [loginChallenge, setLoginChallenge] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const totpStep = Boolean(loginChallenge)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Auto-focus first input when TOTP step appears
  useEffect(() => {
    if (totpStep && inputRefs.current[0]) {
      setTimeout(() => inputRefs.current[0]?.focus(), 100)
    }
  }, [totpStep])

  const handleTotpChange = (index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/\D/g, "").slice(0, 1)
    
    if (digit === "" && totpCode[index] !== "") {
      // Clear current box
      const newCode = [...totpCode]
      newCode[index] = ""
      setTotpCode(newCode)
      setError("")
      
      // Focus previous box if exists
      if (index > 0) {
        inputRefs.current[index - 1]?.focus()
      }
      return
    }
    
    if (digit) {
      // Fill current box
      const newCode = [...totpCode]
      newCode[index] = digit
      setTotpCode(newCode)
      setError("")
      
      // Auto-verify when all boxes are filled
      const isComplete = index === 5 && newCode.every(d => d !== "")
      
      if (isComplete) {
        const fullCode = newCode.join("")
        handleTotpSubmit(fullCode)
      } else if (index < 5) {
        // Move to next box
        inputRefs.current[index + 1]?.focus()
      }
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !totpCode[index] && index > 0) {
      // Move to previous box on backspace
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
    const pastedDigits = pastedData.split("")
    
    const newCode = [...totpCode]
    for (let i = 0; i < pastedDigits.length; i++) {
      if (i < 6) {
        newCode[i] = pastedDigits[i]
      }
    }
    setTotpCode(newCode)
    
    // Auto-verify if all boxes are filled
    if (newCode.every(d => d !== "")) {
      const fullCode = newCode.join("")
      handleTotpSubmit(fullCode)
    } else {
      // Focus the next empty box
      const nextEmptyIndex = newCode.findIndex(d => d === "")
      if (nextEmptyIndex !== -1 && nextEmptyIndex < 6) {
        inputRefs.current[nextEmptyIndex]?.focus()
      }
    }
  }

  const handleTotpSubmit = async (fullCode: string) => {
    if (!loginChallenge || isLoading) return

    setIsLoading(true)
    setError("")

    try {
      const response = await fetch("/api/login/totp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginChallenge, code: fullCode }),
      })
      const data = (await response.json()) as { error?: string }

      if (!response.ok) {
        setError(data.error || "Invalid authenticator code")
        // Clear all boxes on error
        setTotpCode(["", "", "", "", "", ""])
        inputRefs.current[0]?.focus()
        setIsLoading(false)
        return
      }

      router.replace(successRedirect)
      router.refresh()
    } catch {
      setError("Server error. Please try again.")
      setTotpCode(["", "", "", "", "", ""])
      inputRefs.current[0]?.focus()
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      if (totpStep) {
        const fullCode = totpCode.join("")
        if (fullCode.length !== 6) {
          setError("Enter the 6-digit code from your authenticator app")
          setIsLoading(false)
          return
        }

        const response = await fetch("/api/login/totp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ loginChallenge, code: fullCode }),
        })
        const data = (await response.json()) as { error?: string }

        if (!response.ok) {
          setError(data.error || "Invalid authenticator code")
          setIsLoading(false)
          return
        }

        router.replace(successRedirect)
        router.refresh()
        return
      }

      if (!email || !password) {
        setError("Please fill in all fields")
        setIsLoading(false)
        return
      }

      const response = await fetch(loginPath, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ [identifierKey]: email, password }),
      })

      const data = (await response.json()) as {
        error?: string
        requiresTotp?: boolean
        loginChallenge?: string
      }

      if (!response.ok) {
        setError(data.error || "Login failed")
        setIsLoading(false)
        return
      }

      if (data.requiresTotp && data.loginChallenge) {
        setLoginChallenge(data.loginChallenge)
        setTotpCode(["", "", "", "", "", ""])
        setIsLoading(false)
        return
      }

      router.replace(successRedirect)
      router.refresh()
    } catch {
      setError("Server error. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleBackToPassword = () => {
    setLoginChallenge(null)
    setTotpCode(["", "", "", "", "", ""])
    setError("")
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>{totpStep ? "Authenticator code" : title}</CardTitle>
          <CardDescription>
            {totpStep
              ? "Enter the 6-digit code from Google Authenticator to finish signing in."
              : description}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              {!totpStep ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="email">{identifierLabel}</FieldLabel>
                    <Input
                      id="email"
                      type={identifierKey === "email" ? "email" : "text"}
                      placeholder={identifierPlaceholder}
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
                </>
              ) : (
                <Field>
                  <FieldLabel htmlFor="totp-code">Authenticator code</FieldLabel>
                  <div className="flex gap-2 justify-center mt-2">
                    {totpCode.map((digit, index) => (
                      <Input
                        key={index}
                        ref={(el) => {
                          inputRefs.current[index] = el
                        }}
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleTotpChange(index, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(index, e)}
                        onPaste={index === 0 ? handlePaste : undefined}
                        disabled={isLoading}
                        className="w-12 h-12 text-center text-xl font-semibold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        aria-label={`Digit ${index + 1} of 6`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Enter the 6-digit code from your authenticator app
                  </p>
                </Field>
              )}
              {error && (
                <div className="text-sm text-red-500 text-center mt-2">{error}</div>
              )}
              <Field>
                <Button
                  type="submit"
                  disabled={isLoading || (totpStep && totpCode.some(d => d === ""))}
                  className={!isLoading ? "cursor-pointer" : ""}
                >
                  {isLoading ? loadingLabel : totpStep ? "Verify code" : submitLabel}
                </Button>
              </Field>
              {totpStep ? (
                <Field>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={handleBackToPassword}
                    disabled={isLoading}
                  >
                    Back to password
                  </Button>
                </Field>
              ) : null}
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}