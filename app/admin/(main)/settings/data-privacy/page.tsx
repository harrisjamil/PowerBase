"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { 
  Shield, 
  Lock, 
  Eye, 
  Database, 
  FileText, 
  Globe, 
  Users,
  AlertCircle,
  Download,
  Trash2,
  Info
} from "lucide-react"

export default function DataPrivacyPage() {
  const [isLoading, setIsLoading] = useState(false)
  
  // Data Collection Settings
  const [analyticsData, setAnalyticsData] = useState(true)
  const [usageData, setUsageData] = useState(true)
  const [errorReporting, setErrorReporting] = useState(true)
  const [performanceData, setPerformanceData] = useState(true)
  
  // Data Sharing Settings
  const [shareForInsights, setShareForInsights] = useState(false)
  const [shareForImprovements, setShareForImprovements] = useState(true)
  const [shareWithPartners, setShareWithPartners] = useState(false)
  
  // User Data Retention
  const [retentionPeriod, setRetentionPeriod] = useState("365")
  const [autoDeleteInactive, setAutoDeleteInactive] = useState(true)
  const [inactiveDays, setInactiveDays] = useState("180")
  
  // Cookie Settings
  const [necessaryCookies, setNecessaryCookies] = useState(true)
  const [functionalCookies, setFunctionalCookies] = useState(true)
  const [analyticsCookies, setAnalyticsCookies] = useState(true)
  const [marketingCookies, setMarketingCookies] = useState(false)
  
  // GDPR Representatives
  const [hasDPO, setHasDPO] = useState(false)
  const [dpoName, setDpoName] = useState("")
  const [dpoEmail, setDpoEmail] = useState("")
  const [hasEUrep, setHasEUrep] = useState(false)
  const [euRepName, setEuRepName] = useState("")
  const [euRepEmail, setEuRepEmail] = useState("")
  
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)

  const handleSaveAllSettings = async () => {
    setIsLoading(true)
    try {
      // API call to save all privacy settings
      await new Promise(resolve => setTimeout(resolve, 1000))
      toast.success("Privacy settings saved successfully")
      setSaveDialogOpen(false)
    } catch (error) {
      toast.error("Failed to save privacy settings")
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportData = async () => {
    setIsLoading(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 1000))
      toast.success("Data export started. You will receive an email when ready.")
    } catch (error) {
      toast.error("Failed to start data export")
    } finally {
      setIsLoading(false)
    }
  }

  const handleRequestDeletion = async () => {
    setIsLoading(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 1000))
      toast.success("Data deletion request submitted. You will be contacted within 30 days.")
    } catch (error) {
      toast.error("Failed to submit deletion request")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Data Privacy</h2>
        <p className="text-sm text-muted-foreground">
          Manage how PowerBase collects, uses, and protects your data
        </p>
      </div>

      {/* What is PowerBase Service Data */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            What is PowerBase Service Data?
          </CardTitle>
          <CardDescription>
            PowerBase Service Data is information that PowerBase collects and generates during 
            the provision and administration of the PowerBase services, excluding Customer Data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            PowerBase uses Service Data in accordance with our{" "}
            <a href="#" className="text-blue-600 hover:underline">Privacy Policy</a> and 
            applicable terms.{" "}
            <a href="#" className="text-blue-600 hover:underline">Learn more</a>.
          </p>
          
          <div className="bg-muted/50 rounded-lg p-4 mt-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-blue-500 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium mb-1">Examples of PowerBase Service Data include:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Usage patterns and feature adoption metrics</li>
                  <li>Performance and error logs</li>
                  <li>API request metadata</li>
                  <li>System configuration preferences</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Usage Settings */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Data Usage & Privacy Controls
          </CardTitle>
          <CardDescription>
            Control how your Service Data is used to improve your experience
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label>Let PowerBase use your data to provide enhanced analytics and insights</Label>
              <p className="text-sm text-muted-foreground">
                Allow PowerBase to analyze your usage patterns to provide deeper insights 
                and recommendations about your use of PowerBase services
              </p>
            </div>
            <Switch
              checked={shareForInsights}
              onCheckedChange={setShareForInsights}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label>Let PowerBase use your data to improve PowerBase services</Label>
              <p className="text-sm text-muted-foreground">
                Help us improve PowerBase by using your Service Data to enhance features, 
                fix bugs, and optimize performance
              </p>
            </div>
            <Switch
              checked={shareForImprovements}
              onCheckedChange={setShareForImprovements}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label>Share anonymized data with trusted partners</Label>
              <p className="text-sm text-muted-foreground">
                Allow trusted partners to access anonymized data for research and 
                integration improvements
              </p>
            </div>
            <Switch
              checked={shareWithPartners}
              onCheckedChange={setShareWithPartners}
            />
          </div>

          {!shareForInsights && !shareForImprovements && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
              <p className="text-xs text-amber-700">
                <AlertCircle className="h-3 w-3 inline mr-1" />
                If you disable these options, PowerBase Service Data will still be used to make 
                recommendations about and improve PowerBase services, and to deliver and improve 
                other services you request.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Collection Settings */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Data Collection Preferences
          </CardTitle>
          <CardDescription>
            Choose what types of data PowerBase collects about your usage
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Analytics Data</Label>
              <p className="text-sm text-muted-foreground">
                Collect data about how you use PowerBase features and services
              </p>
            </div>
            <Switch
              checked={analyticsData}
              onCheckedChange={setAnalyticsData}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Usage Statistics</Label>
              <p className="text-sm text-muted-foreground">
                Track feature usage, session duration, and interaction patterns
              </p>
            </div>
            <Switch
              checked={usageData}
              onCheckedChange={setUsageData}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Error Reporting</Label>
              <p className="text-sm text-muted-foreground">
                Automatically report errors and crashes to help improve stability
              </p>
            </div>
            <Switch
              checked={errorReporting}
              onCheckedChange={setErrorReporting}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Performance Data</Label>
              <p className="text-sm text-muted-foreground">
                Collect performance metrics like load times and response rates
              </p>
            </div>
            <Switch
              checked={performanceData}
              onCheckedChange={setPerformanceData}
            />
          </div>
        </CardContent>
      </Card>

      {/* Data Retention */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Data Retention
          </CardTitle>
          <CardDescription>
            Configure how long PowerBase retains your data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="retention-period">Data Retention Period (days)</Label>
            <Input
              id="retention-period"
              type="number"
              value={retentionPeriod}
              onChange={(e) => setRetentionPeriod(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              How long PowerBase keeps your Service Data before automatic deletion
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Auto-delete inactive user data</Label>
              <p className="text-sm text-muted-foreground">
                Automatically delete data for users who haven't logged in for a specified period
              </p>
            </div>
            <Switch
              checked={autoDeleteInactive}
              onCheckedChange={setAutoDeleteInactive}
            />
          </div>

          {autoDeleteInactive && (
            <div className="space-y-2 pl-6">
              <Label htmlFor="inactive-days">Days of inactivity before deletion</Label>
              <Input
                id="inactive-days"
                type="number"
                value={inactiveDays}
                onChange={(e) => setInactiveDays(e.target.value)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cookie Settings */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Cookie Preferences
          </CardTitle>
          <CardDescription>
            Manage how PowerBase uses cookies and similar technologies
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Necessary Cookies</Label>
              <p className="text-sm text-muted-foreground">
                Required for the platform to function properly
              </p>
              <p className="text-xs text-muted-foreground">Always enabled</p>
            </div>
            <Switch checked={necessaryCookies} disabled />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Functional Cookies</Label>
              <p className="text-sm text-muted-foreground">
                Enable enhanced functionality like remembering preferences
              </p>
            </div>
            <Switch
              checked={functionalCookies}
              onCheckedChange={setFunctionalCookies}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Analytics Cookies</Label>
              <p className="text-sm text-muted-foreground">
                Help us understand how visitors interact with PowerBase
              </p>
            </div>
            <Switch
              checked={analyticsCookies}
              onCheckedChange={setAnalyticsCookies}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Marketing Cookies</Label>
              <p className="text-sm text-muted-foreground">
                Used to deliver relevant advertisements and track campaign performance
              </p>
            </div>
            <Switch
              checked={marketingCookies}
              onCheckedChange={setMarketingCookies}
            />
          </div>
        </CardContent>
      </Card>

      {/* GDPR Representatives */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Privacy Representatives
          </CardTitle>
          <CardDescription>
            Under the General Data Protection Regulation (GDPR), developers collecting or processing 
            user data at "large scale", collecting or processing certain types of sensitive data, 
            or who are a "public authority or body" may need to designate a Data Protection Officer (DPO) 
            and/or an EU representative.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Designate Data Protection Officer (DPO)</Label>
              <p className="text-sm text-muted-foreground">
                Required if you process large-scale sensitive data or are a public authority
              </p>
            </div>
            <Switch
              checked={hasDPO}
              onCheckedChange={setHasDPO}
            />
          </div>

          {hasDPO && (
            <div className="space-y-4 pl-6 border-l-2 border-muted">
              <div className="space-y-2">
                <Label htmlFor="dpo-name">DPO Name</Label>
                <Input
                  id="dpo-name"
                  value={dpoName}
                  onChange={(e) => setDpoName(e.target.value)}
                  placeholder="Enter DPO name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dpo-email">DPO Email</Label>
                <Input
                  id="dpo-email"
                  type="email"
                  value={dpoEmail}
                  onChange={(e) => setDpoEmail(e.target.value)}
                  placeholder="dpo@example.com"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-4">
            <div className="space-y-0.5">
              <Label>Designate EU Representative</Label>
              <p className="text-sm text-muted-foreground">
                Required for organizations outside the EU processing EU citizens' data
              </p>
            </div>
            <Switch
              checked={hasEUrep}
              onCheckedChange={setHasEUrep}
            />
          </div>

          {hasEUrep && (
            <div className="space-y-4 pl-6 border-l-2 border-muted">
              <div className="space-y-2">
                <Label htmlFor="eu-rep-name">EU Representative Name</Label>
                <Input
                  id="eu-rep-name"
                  value={euRepName}
                  onChange={(e) => setEuRepName(e.target.value)}
                  placeholder="Enter EU representative name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eu-rep-email">EU Representative Email</Label>
                <Input
                  id="eu-rep-email"
                  type="email"
                  value={euRepEmail}
                  onChange={(e) => setEuRepEmail(e.target.value)}
                  placeholder="eu-rep@example.com"
                />
              </div>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
            <p className="text-xs text-blue-700">
              <Info className="h-3 w-3 inline mr-1" />
              <a href="#" className="underline">Learn more</a> about GDPR requirements and when you need to designate representatives.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Data Rights & Actions */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Your Data Rights
          </CardTitle>
          <CardDescription>
            Exercise your rights under data protection regulations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button variant="outline" onClick={handleExportData} disabled={isLoading}>
              <Download className="h-4 w-4 mr-2" />
              Export My Data
            </Button>
            <Button variant="outline" onClick={handleRequestDeletion} disabled={isLoading}>
              <Trash2 className="h-4 w-4 mr-2" />
              Request Data Deletion
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Requests are typically processed within 30 days. You may be asked to verify your identity.
          </p>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end gap-4">
        <Button variant="outline" onClick={() => window.location.reload()}>
          Reset
        </Button>
        <Button onClick={() => setSaveDialogOpen(true)} disabled={isLoading}>
          {isLoading ? "Saving..." : "Save All Privacy Settings"}
        </Button>
      </div>

      {/* Save Confirmation Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Privacy Settings</DialogTitle>
            <DialogDescription>
              Are you sure you want to save these privacy settings? Changes will take effect immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveAllSettings}>
              Confirm Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}