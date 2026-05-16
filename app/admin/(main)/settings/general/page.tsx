"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { Building2, Shield, Bell, Loader2 } from "lucide-react"

type SecuritySettings = {
  twoFactorRequired: boolean
  sessionTimeoutMinutes: number
  maxLoginAttempts: number
  passwordExpiryDays: number
}

type GeneralSettings = {
  platformName: string
  platformUrl: string
  supportEmail: string
  timezone: string
  dateFormat: string
}

type NotificationSettings = {
  emailNotifications: boolean
  newUserAlert: boolean
  securityAlerts: boolean
  systemUpdates: boolean
}

export default function SuperAdminGeneralSettings() {
  const [isLoading, setIsLoading] = useState(false)
  const [generalLoading, setGeneralLoading] = useState(true)
  const [notificationsLoading, setNotificationsLoading] = useState(true)

  // Platform settings
  const [platformName, setPlatformName] = useState("PowerBase")
  const [platformUrl, setPlatformUrl] = useState("")
  const [supportEmail, setSupportEmail] = useState("")
  const [timezone, setTimezone] = useState("UTC")
  const [dateFormat, setDateFormat] = useState("YYYY-MM-DD")

  // Security settings
  const [twoFactorAuth, setTwoFactorAuth] = useState(false)
  const [sessionTimeout, setSessionTimeout] = useState("60")
  const [maxLoginAttempts, setMaxLoginAttempts] = useState("5")
  const [passwordExpiry, setPasswordExpiry] = useState("90")
  const [totpEnrolled, setTotpEnrolled] = useState(false)
  const [securityLoading, setSecurityLoading] = useState(true)
  const [totpDialogOpen, setTotpDialogOpen] = useState(false)
  const [enrollmentId, setEnrollmentId] = useState<string | null>(null)
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null)
  const [manualEntryKey, setManualEntryKey] = useState<string | null>(null)
  const [totpCode, setTotpCode] = useState("")
  const [totpSetupLoading, setTotpSetupLoading] = useState(false)
  const [enrollThenEnable, setEnrollThenEnable] = useState(false)

  // Notification settings
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [newUserAlert, setNewUserAlert] = useState(true)
  const [securityAlerts, setSecurityAlerts] = useState(true)
  const [systemUpdates, setSystemUpdates] = useState(false)

  const loadGeneralSettings = useCallback(async () => {
    setGeneralLoading(true)
    try {
      const response = await fetch("/api/admin/settings/general")
      const data = (await response.json()) as {
        success?: boolean
        settings?: GeneralSettings
        error?: string
      }
      if (!response.ok || !data.success || !data.settings) {
        throw new Error(data.error || "Failed to load general settings")
      }
      setPlatformName(data.settings.platformName)
      setPlatformUrl(data.settings.platformUrl)
      setSupportEmail(data.settings.supportEmail)
      setTimezone(data.settings.timezone)
      setDateFormat(data.settings.dateFormat)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load general settings")
    } finally {
      setGeneralLoading(false)
    }
  }, [])

  const loadNotificationSettings = useCallback(async () => {
    setNotificationsLoading(true)
    try {
      const response = await fetch("/api/admin/settings/notifications")
      const data = (await response.json()) as {
        success?: boolean
        settings?: NotificationSettings
        error?: string
      }
      if (!response.ok || !data.success || !data.settings) {
        throw new Error(data.error || "Failed to load notification settings")
      }
      setEmailNotifications(data.settings.emailNotifications)
      setNewUserAlert(data.settings.newUserAlert)
      setSecurityAlerts(data.settings.securityAlerts)
      setSystemUpdates(data.settings.systemUpdates)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load notification settings"
      )
    } finally {
      setNotificationsLoading(false)
    }
  }, [])

  const loadSecuritySettings = useCallback(async () => {
    setSecurityLoading(true)
    try {
      const response = await fetch("/api/admin/settings/security")
      const data = (await response.json()) as {
        success?: boolean
        settings?: SecuritySettings
        totp?: { enrolled: boolean }
        error?: string
      }
      if (!response.ok || !data.success || !data.settings) {
        throw new Error(data.error || "Failed to load security settings")
      }
      setTwoFactorAuth(data.settings.twoFactorRequired)
      setSessionTimeout(String(data.settings.sessionTimeoutMinutes))
      setMaxLoginAttempts(String(data.settings.maxLoginAttempts))
      setPasswordExpiry(String(data.settings.passwordExpiryDays))
      setTotpEnrolled(Boolean(data.totp?.enrolled))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load security settings")
    } finally {
      setSecurityLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadGeneralSettings()
    void loadSecuritySettings()
    void loadNotificationSettings()
  }, [loadGeneralSettings, loadSecuritySettings, loadNotificationSettings])

  const handleSaveGeneral = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/admin/settings/general", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platformName,
          platformUrl,
          supportEmail,
          timezone,
          dateFormat,
        }),
      })
      const data = (await response.json()) as {
        success?: boolean
        settings?: GeneralSettings
        error?: string
      }
      if (!response.ok || !data.success || !data.settings) {
        throw new Error(data.error || "Failed to save general settings")
      }
      setPlatformName(data.settings.platformName)
      setPlatformUrl(data.settings.platformUrl)
      setSupportEmail(data.settings.supportEmail)
      setTimezone(data.settings.timezone)
      setDateFormat(data.settings.dateFormat)
      toast.success("General settings saved successfully")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save settings")
    } finally {
      setIsLoading(false)
    }
  }

  const saveSecuritySettings = async (overrides?: Partial<SecuritySettings>) => {
    const response = await fetch("/api/admin/settings/security", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        twoFactorRequired: overrides?.twoFactorRequired ?? twoFactorAuth,
        sessionTimeoutMinutes: Number(
          overrides?.sessionTimeoutMinutes ?? sessionTimeout
        ),
        maxLoginAttempts: Number(overrides?.maxLoginAttempts ?? maxLoginAttempts),
        passwordExpiryDays: Number(overrides?.passwordExpiryDays ?? passwordExpiry),
      }),
    })
    const data = (await response.json()) as {
      success?: boolean
      settings?: SecuritySettings
      totp?: { enrolled: boolean }
      error?: string
      needsTotpEnrollment?: boolean
    }
    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to save security settings")
    }
    if (data.settings) {
      setTwoFactorAuth(data.settings.twoFactorRequired)
      setSessionTimeout(String(data.settings.sessionTimeoutMinutes))
      setMaxLoginAttempts(String(data.settings.maxLoginAttempts))
      setPasswordExpiry(String(data.settings.passwordExpiryDays))
    }
    setTotpEnrolled(Boolean(data.totp?.enrolled))
  }

  const startTotpEnrollment = async (enableAfter = false) => {
    setEnrollThenEnable(enableAfter)
    setTotpSetupLoading(true)
    try {
      const response = await fetch("/api/admin/totp/enroll", { method: "POST" })
      const data = (await response.json()) as {
        success?: boolean
        enrollmentId?: string
        qrCodeDataUrl?: string
        manualEntryKey?: string
        error?: string
      }
      if (!response.ok || !data.success || !data.enrollmentId || !data.qrCodeDataUrl) {
        throw new Error(data.error || "Failed to start authenticator setup")
      }
      setEnrollmentId(data.enrollmentId)
      setQrCodeDataUrl(data.qrCodeDataUrl)
      setManualEntryKey(data.manualEntryKey ?? null)
      setTotpCode("")
      setTotpDialogOpen(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start authenticator setup")
    } finally {
      setTotpSetupLoading(false)
    }
  }

  const confirmTotpEnrollment = async () => {
    if (!enrollmentId) return
    setTotpSetupLoading(true)
    try {
      const response = await fetch("/api/admin/totp/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollmentId, code: totpCode }),
      })
      const data = (await response.json()) as { success?: boolean; error?: string }
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Invalid verification code")
      }
      setTotpEnrolled(true)
      setTotpDialogOpen(false)
      toast.success("Google Authenticator configured successfully")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to verify code")
    } finally {
      setTotpSetupLoading(false)
    }
  }

  const handleTwoFactorToggle = async (checked: boolean) => {
    if (checked && !totpEnrolled) {
      await startTotpEnrollment(true)
      return
    }

    setIsLoading(true)
    try {
      await saveSecuritySettings({ twoFactorRequired: checked })
      setTwoFactorAuth(checked)
      toast.success(
        checked ? "Two-factor authentication enabled" : "Two-factor authentication disabled"
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update 2FA setting")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveSecurity = async () => {
    setIsLoading(true)
    try {
      await saveSecuritySettings()
      toast.success("Security settings saved successfully")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save security settings")
    } finally {
      setIsLoading(false)
    }
  }

  const finishEnrollmentAndEnable = async () => {
    if (!enrollmentId) return
    setTotpSetupLoading(true)
    try {
      const response = await fetch("/api/admin/totp/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollmentId, code: totpCode }),
      })
      const data = (await response.json()) as { success?: boolean; error?: string }
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Invalid verification code")
      }

      setTotpEnrolled(true)
      setTotpDialogOpen(false)
      await saveSecuritySettings({ twoFactorRequired: true })
      setTwoFactorAuth(true)
      toast.success("Two-factor authentication is now required for admin login")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to verify authenticator")
    } finally {
      setTotpSetupLoading(false)
    }
  }

  const handleSaveNotifications = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/admin/settings/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailNotifications,
          newUserAlert,
          securityAlerts,
          systemUpdates,
        }),
      })
      const data = (await response.json()) as {
        success?: boolean
        settings?: NotificationSettings
        error?: string
      }
      if (!response.ok || !data.success || !data.settings) {
        throw new Error(data.error || "Failed to save notification settings")
      }
      setEmailNotifications(data.settings.emailNotifications)
      setNewUserAlert(data.settings.newUserAlert)
      setSecurityAlerts(data.settings.securityAlerts)
      setSystemUpdates(data.settings.systemUpdates)
      toast.success("Notification settings saved successfully")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save notification settings"
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">General Settings</h2>
        <p className="text-sm text-muted-foreground">
          Configure global platform settings for PowerBase
        </p>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
          <TabsTrigger value="general" className="gap-2">
            <Building2 className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="h-4 w-4" />
            Security
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </TabsTrigger>
        </TabsList>

        {/* General Settings Tab */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>Platform Information</CardTitle>
              <CardDescription>
                Configure basic platform information and branding
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {generalLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
              <>
              <div className="space-y-2">
                <Label htmlFor="platform-name">Platform Name</Label>
                <Input
                  id="platform-name"
                  value={platformName}
                  onChange={(e) => setPlatformName(e.target.value)}
                  placeholder="PowerBase"
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">
                  This name appears throughout the platform
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="platform-url">Platform URL</Label>
                <Input
                  id="platform-url"
                  value={platformUrl}
                  onChange={(e) => setPlatformUrl(e.target.value)}
                  placeholder="https://powerbase.example.com"
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="support-email">Support Email</Label>
                <Input
                  id="support-email"
                  type="email"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  placeholder="support@powerbase.com"
                  disabled={isLoading}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="timezone">Default Timezone</Label>
                  <Select value={timezone} onValueChange={setTimezone} disabled={isLoading}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTC">UTC</SelectItem>
                      <SelectItem value="America/New_York">Eastern Time</SelectItem>
                      <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                      <SelectItem value="Europe/London">London</SelectItem>
                      <SelectItem value="Asia/Dubai">Dubai</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="date-format">Date Format</Label>
                  <Select value={dateFormat} onValueChange={setDateFormat} disabled={isLoading}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                      <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                      <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button onClick={() => void handleSaveGeneral()} disabled={isLoading}>
                {isLoading ? "Saving..." : "Save Changes"}
              </Button>
              </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Settings Tab */}
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Security Configuration</CardTitle>
              <CardDescription>
                Configure platform security and authentication settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label>Two-Factor Authentication</Label>
                  <p className="text-sm text-muted-foreground">
                    Require Google Authenticator codes when signing in to the admin area
                  </p>
                  {totpEnrolled ? (
                    <p className="text-xs text-green-600">Authenticator configured for your account</p>
                  ) : (
                    <p className="text-xs text-amber-600">
                      Scan a QR code to set up Google Authenticator before enabling
                    </p>
                  )}
                </div>
                <Switch
                  checked={twoFactorAuth}
                  onCheckedChange={handleTwoFactorToggle}
                  disabled={securityLoading || isLoading || totpSetupLoading}
                />
              </div>

              {!totpEnrolled && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void startTotpEnrollment()}
                  disabled={totpSetupLoading || securityLoading}
                >
                  {totpSetupLoading ? "Preparing QR code..." : "Set up Google Authenticator"}
                </Button>
              )}

              <div className="space-y-2">
                <Label htmlFor="session-timeout">Session Timeout (minutes)</Label>
                <Input
                  id="session-timeout"
                  type="number"
                  value={sessionTimeout}
                  onChange={(e) => setSessionTimeout(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Time after which inactive sessions expire
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-login-attempts">Maximum Login Attempts</Label>
                <Input
                  id="max-login-attempts"
                  type="number"
                  value={maxLoginAttempts}
                  onChange={(e) => setMaxLoginAttempts(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password-expiry">Password Expiry (days)</Label>
                <Input
                  id="password-expiry"
                  type="number"
                  value={passwordExpiry}
                  onChange={(e) => setPasswordExpiry(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Number of days before password must be changed
                </p>
              </div>

              <Button onClick={() => void handleSaveSecurity()} disabled={isLoading || securityLoading}>
                {isLoading ? "Saving..." : "Save Security Settings"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>
                Configure system-wide notification settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {notificationsLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
              <>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Send email notifications for system events
                  </p>
                </div>
                <Switch
                  checked={emailNotifications}
                  onCheckedChange={setEmailNotifications}
                  disabled={isLoading}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>New User Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Notify admins when new users register
                  </p>
                </div>
                <Switch
                  checked={newUserAlert}
                  onCheckedChange={setNewUserAlert}
                  disabled={isLoading}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Security Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive alerts for security-related events
                  </p>
                </div>
                <Switch
                  checked={securityAlerts}
                  onCheckedChange={setSecurityAlerts}
                  disabled={isLoading}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>System Updates</Label>
                  <p className="text-sm text-muted-foreground">
                    Notifications about platform updates
                  </p>
                </div>
                <Switch
                  checked={systemUpdates}
                  onCheckedChange={setSystemUpdates}
                  disabled={isLoading}
                />
              </div>

              <Button onClick={() => void handleSaveNotifications()} disabled={isLoading}>
                {isLoading ? "Saving..." : "Save Notification Settings"}
              </Button>
              </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={totpDialogOpen}
        onOpenChange={(open) => {
          setTotpDialogOpen(open)
          if (!open && enrollThenEnable && !totpEnrolled) {
            setTwoFactorAuth(false)
            setEnrollThenEnable(false)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set up Google Authenticator</DialogTitle>
            <DialogDescription>
              Scan the QR code with Google Authenticator (or another TOTP app), then enter
              the 6-digit code to verify.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {qrCodeDataUrl ? (
              <div className="flex justify-center rounded-lg border bg-white p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrCodeDataUrl}
                  alt="Google Authenticator QR code"
                  className="h-48 w-48"
                />
              </div>
            ) : null}

            {manualEntryKey ? (
              <div className="space-y-1">
                <Label>Manual entry key</Label>
                <p className="break-all rounded-md border bg-muted px-3 py-2 font-mono text-sm">
                  {manualEntryKey}
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="totp-code">Verification code</Label>
              <Input
                id="totp-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                disabled={totpSetupLoading}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTotpDialogOpen(false)}
              disabled={totpSetupLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() =>
                void (enrollThenEnable ? finishEnrollmentAndEnable() : confirmTotpEnrollment())
              }
              disabled={totpSetupLoading || totpCode.length !== 6}
            >
              {totpSetupLoading ? "Verifying..." : "Verify and continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}