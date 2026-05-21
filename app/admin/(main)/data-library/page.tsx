"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Database,
  Plus,
  RefreshCw,
  Trash2,
  MoreHorizontal,
  Calendar,
  FolderOpen,
  FileText,
  Search,
  Loader2,
  Upload,
  Download,
  Eye,
  Edit,
  Copy,
  Share2,
  Tag,
  Filter,
  X,
  ChevronDown,
  Grid3X3,
  List,
  ArrowUpDown,
  Clock,
  User,
  HardDrive,
  Link,
  ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"

type DataAsset = {
  id: string
  name: string
  description: string
  type: "dataset" | "model" | "dashboard" | "report" | "api" | "document"
  category: string
  size: number
  version: string
  createdAt: string
  updatedAt: string
  owner: string
  tags: string[]
  status: "active" | "archived" | "draft"
  downloads: number
  views: number
  url?: string
  format?: string
  derived?: boolean
}

type Folder = {
  id: string
  name: string
  path: string
  assetCount: number
  createdAt: string
}

type Category = {
  id: string
  name: string
  icon: string
  count: number
}

export default function DataLibraryPage() {
  const [assets, setAssets] = useState<DataAsset[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedType, setSelectedType] = useState<string>("all")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [sortBy, setSortBy] = useState<"name" | "date" | "size" | "downloads">("date")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
  
  // Dialog states
  const [uploadOpen, setUploadOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  
  // Form states
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState<DataAsset | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  
  const [newAsset, setNewAsset] = useState({
    name: "",
    description: "",
    type: "dataset" as DataAsset["type"],
    category: "",
    tags: [] as string[],
    format: "",
    url: "",
  })
  
  const [newFolder, setNewFolder] = useState({
    name: "",
    path: "/",
  })
  
  const [tagInput, setTagInput] = useState("")
  const [shareEmail, setShareEmail] = useState("")
  const [sharePermission, setSharePermission] = useState<"view" | "edit" | "admin">("view")

  const loadData = useCallback(async () => {
    try {
      const response = await fetch("/api/data-library")
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to load data library")
      }

      setAssets(result.assets ?? [])
      setFolders(result.folders ?? [])
    } catch (error) {
      console.error("Error loading data:", error)
      toast.error(error instanceof Error ? error.message : "Failed to load data library")
    }
  }, [])

  const loadDataWithSpinner = useCallback(async () => {
    setLoading(true)
    await loadData()
    setLoading(false)
  }, [loadData])

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }

  useEffect(() => {
    loadDataWithSpinner()
  }, [loadDataWithSpinner])

  const recordAssetView = useCallback(async (asset: DataAsset) => {
    if (asset.derived || !asset.id.startsWith("db:")) return
    try {
      await fetch("/api/data-library", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "view", id: asset.id }),
      })
    } catch {
      // Non-blocking telemetry
    }
  }, [])

  const openAssetDetails = useCallback(
    (asset: DataAsset) => {
      setSelectedAsset(asset)
      setDetailsOpen(true)
      void recordAssetView(asset)
    },
    [recordAssetView]
  )

  const filteredAndSortedAssets = useMemo(() => {
    let filtered = assets
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (asset) =>
          asset.name.toLowerCase().includes(query) ||
          asset.description.toLowerCase().includes(query) ||
          asset.tags.some((tag) => tag.toLowerCase().includes(query))
      )
    }
    
    // Type filter
    if (selectedType !== "all") {
      filtered = filtered.filter((asset) => asset.type === selectedType)
    }
    
    // Category filter
    if (selectedCategory !== "all") {
      filtered = filtered.filter((asset) => asset.category === selectedCategory)
    }
    
    // Sorting
    filtered.sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case "name":
          comparison = a.name.localeCompare(b.name)
          break
        case "date":
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
          break
        case "size":
          comparison = a.size - b.size
          break
        case "downloads":
          comparison = a.downloads - b.downloads
          break
      }
      return sortOrder === "asc" ? comparison : -comparison
    })
    
    return filtered
  }, [assets, searchQuery, selectedType, selectedCategory, sortBy, sortOrder])

  const categories = useMemo(() => {
    const cats = new Map<string, number>()
    assets.forEach((asset) => {
      cats.set(asset.category, (cats.get(asset.category) || 0) + 1)
    })
    return Array.from(cats.entries()).map(([name, count]) => ({ id: name, name, icon: "folder", count }))
  }, [assets])

  const stats = useMemo(
    () => ({
      total: assets.length,
      totalSize: assets.reduce((sum, asset) => sum + asset.size, 0),
      totalDownloads: assets.reduce((sum, asset) => sum + asset.downloads, 0),
      totalViews: assets.reduce((sum, asset) => sum + asset.views, 0),
      datasets: assets.filter((a) => a.type === "dataset").length,
      models: assets.filter((a) => a.type === "model").length,
      documents: assets.filter((a) => a.type === "document").length,
      active: assets.filter((a) => a.status === "active").length,
    }),
    [assets]
  )

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "N/A"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "dataset":
        return <Database className="h-4 w-4" />
      case "model":
        return <FileText className="h-4 w-4" />
      case "dashboard":
        return <ExternalLink className="h-4 w-4" />
      case "report":
        return <FileText className="h-4 w-4" />
      case "api":
        return <Link className="h-4 w-4" />
      default:
        return <FileText className="h-4 w-4" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-700"
      case "archived":
        return "bg-gray-100 text-gray-700"
      case "draft":
        return "bg-yellow-100 text-yellow-700"
      default:
        return "bg-gray-100 text-gray-700"
    }
  }

  const handleUpload = async () => {
    if (!newAsset.name.trim()) {
      toast.error("Please enter an asset name")
      return
    }

    setUploading(true)
    setUploadProgress(30)

    try {
      const response = await fetch("/api/data-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "asset",
          name: newAsset.name,
          description: newAsset.description,
          type: newAsset.type,
          category: newAsset.category || "Documentation",
          tags: newAsset.tags,
          format: newAsset.format,
          url: newAsset.url,
        }),
      })
      setUploadProgress(80)
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to register asset")
      }

      setUploadProgress(100)
      await loadData()
      toast.success(`"${newAsset.name}" added to the library`)
      setUploadOpen(false)
      setNewAsset({
        name: "",
        description: "",
        type: "dataset",
        category: "",
        tags: [],
        format: "",
        url: "",
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to register asset")
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const handleDelete = async () => {
    if (!selectedAsset) return

    if (selectedAsset.derived) {
      toast.error("Schema and system assets cannot be deleted from the library")
      setDeleteOpen(false)
      return
    }

    setDeleting(true)
    try {
      const response = await fetch(
        `/api/data-library?id=${encodeURIComponent(selectedAsset.id)}`,
        { method: "DELETE" }
      )
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to delete asset")
      }

      await loadData()
      toast.success(`"${selectedAsset.name}" has been removed`)
      setDeleteOpen(false)
      setSelectedAsset(null)
      setDetailsOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete asset")
    } finally {
      setDeleting(false)
    }
  }

  const handleAddTag = () => {
    if (tagInput && !newAsset.tags.includes(tagInput)) {
      setNewAsset({
        ...newAsset,
        tags: [...newAsset.tags, tagInput],
      })
      setTagInput("")
    }
  }

  const handleRemoveTag = (tag: string) => {
    setNewAsset({
      ...newAsset,
      tags: newAsset.tags.filter((t) => t !== tag),
    })
  }

  const handleCreateFolder = async () => {
    if (!newFolder.name.trim()) {
      toast.error("Please enter a folder name")
      return
    }

    try {
      const response = await fetch("/api/data-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "folder",
          name: newFolder.name,
          path: newFolder.path,
        }),
      })
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to create folder")
      }

      await loadData()
      toast.success(`Folder "${newFolder.name}" created`)
      setCreateFolderOpen(false)
      setNewFolder({ name: "", path: "/" })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create folder")
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading data library...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-4 md:px-6 md:py-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Database className="h-6 w-6" />
            Data Library
          </h1>
          <p className="text-sm text-muted-foreground">
            Catalog schema exports, project backups, query results, API references, and team docs for your PowerBuddy workspace
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button onClick={() => setCreateFolderOpen(true)} variant="outline" className="gap-2">
            <FolderOpen className="h-4 w-4" />
            New Folder
          </Button>
          <Button onClick={() => setUploadOpen(true)} className="gap-2">
            <Upload className="h-4 w-4" />
            Add Asset
          </Button>
          <Button onClick={handleRefresh} variant="outline" size="icon" disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>
      
      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Assets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.datasets} exports, {stats.documents} docs, {stats.active} active
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Size</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBytes(stats.totalSize)}</div>
            <p className="text-xs text-muted-foreground mt-1">DDL dumps, CSVs, and backups</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Downloads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalDownloads.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Exports pulled by admins</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Views</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalViews.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Opens in library & visualizer</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{categories.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Different categories</p>
          </CardContent>
        </Card>
      </div>

      {/* Folders */}
      {folders.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Folders</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {folders.map((folder) => (
              <Card
                key={folder.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => setSelectedCategory(folder.name)}
              >
                <CardContent className="flex items-center gap-3 p-4">
                  <FolderOpen className="h-8 w-8 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{folder.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {folder.assetCount} assets · {folder.path}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
      
      {/* Search and Filters */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search exports, schemas, docs, or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <div className="flex gap-2">
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="dataset">Datasets</SelectItem>
                <SelectItem value="model">Query Templates</SelectItem>
                <SelectItem value="dashboard">Dashboards</SelectItem>
                <SelectItem value="report">Reports</SelectItem>
                <SelectItem value="api">APIs</SelectItem>
                <SelectItem value="document">Documents</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.name}>
                    {cat.name} ({cat.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <div className="flex gap-1 border rounded-md">
              <Button
                variant={viewMode === "grid" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("grid")}
                className="px-3"
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("list")}
                className="px-3"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              className="gap-1"
            >
              <ArrowUpDown className="h-3 w-3" />
              {sortOrder === "asc" ? "Ascending" : "Descending"}
            </Button>
            <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
              <SelectTrigger className="w-[130px] h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Sort by Name</SelectItem>
                <SelectItem value="date">Sort by Date</SelectItem>
                <SelectItem value="size">Sort by Size</SelectItem>
                <SelectItem value="downloads">Sort by Downloads</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <p className="text-sm text-muted-foreground">
            Showing {filteredAndSortedAssets.length} of {assets.length} assets
          </p>
        </div>
      </div>
      
      {/* Assets Display */}
      {viewMode === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredAndSortedAssets.map((asset) => (
            <Card
              key={asset.id}
              className="hover:shadow-lg transition-all cursor-pointer group"
              onClick={() => openAssetDetails(asset)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {getTypeIcon(asset.type)}
                    <CardTitle className="text-base truncate">{asset.name}</CardTitle>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openAssetDetails(asset)}>
                        <Eye className="mr-2 h-4 w-4" />
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {
                        setSelectedAsset(asset)
                        setEditOpen(true)
                      }}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </DropdownMenuItem>
                      {!asset.derived && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => {
                              setSelectedAsset(asset)
                              setDeleteOpen(true)
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                  {asset.description}
                </p>
                <div className="flex flex-wrap gap-1 mb-3">
                  {asset.tags.slice(0, 3).map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                  {asset.tags.length > 3 && (
                    <Badge variant="secondary" className="text-xs">
                      +{asset.tags.length - 3}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDate(asset.updatedAt)}
                  </div>
                  <div className="flex items-center gap-1">
                    <Download className="h-3 w-3" />
                    {asset.downloads}
                  </div>
                  <Badge className={getStatusColor(asset.status)}>
                    {asset.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Downloads</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[70px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedAssets.map((asset) => (
                <TableRow
                  key={asset.id}
                  className="hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => openAssetDetails(asset)}
                >
                  <TableCell>
                    <div>
                      <div className="font-medium">{asset.name}</div>
                      <div className="text-xs text-muted-foreground line-clamp-1">
                        {asset.description}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {getTypeIcon(asset.type)}
                      <span className="capitalize">{asset.type}</span>
                    </div>
                  </TableCell>
                  <TableCell>{asset.category}</TableCell>
                  <TableCell>{formatBytes(asset.size)}</TableCell>
                  <TableCell>v{asset.version}</TableCell>
                  <TableCell>{formatDate(asset.updatedAt)}</TableCell>
                  <TableCell>{asset.downloads.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(asset.status)}>
                      {asset.status}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openAssetDetails(asset)}>
                          <Eye className="mr-2 h-4 w-4" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Download className="mr-2 h-4 w-4" />
                          Download
                        </DropdownMenuItem>
                        {!asset.derived && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => {
                                setSelectedAsset(asset)
                                setDeleteOpen(true)
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      
      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Add Library Asset</DialogTitle>
            <DialogDescription>
              Register a schema export, backup, document, or link so your team can find it in PowerBuddy.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Asset Name *</Label>
              <Input
                id="name"
                placeholder="e.g., public — Full DDL Export"
                value={newAsset.name}
                onChange={(e) => setNewAsset({ ...newAsset, name: e.target.value })}
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Schema name, tables included, and when to use this export..."
                value={newAsset.description}
                onChange={(e) => setNewAsset({ ...newAsset, description: e.target.value })}
                rows={3}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select
                  value={newAsset.type}
                  onValueChange={(value: any) => setNewAsset({ ...newAsset, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dataset">Dataset</SelectItem>
                    <SelectItem value="model">Query Template</SelectItem>
                    <SelectItem value="dashboard">Dashboard</SelectItem>
                    <SelectItem value="report">Report</SelectItem>
                    <SelectItem value="api">API</SelectItem>
                    <SelectItem value="document">Document</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid gap-2">
                <Label>Category</Label>
                <Input
                  placeholder="e.g., Schema Exports"
                  value={newAsset.category}
                  onChange={(e) => setNewAsset({ ...newAsset, category: e.target.value })}
                />
              </div>
            </div>
            
            <div className="grid gap-2">
              <Label>Tags</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Add tags..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleAddTag()}
                />
                <Button type="button" onClick={handleAddTag} size="sm">
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {newAsset.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => handleRemoveTag(tag)}
                    />
                  </Badge>
                ))}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Format</Label>
                <Input
                  placeholder="e.g., sql, csv, dump, md"
                  value={newAsset.format}
                  onChange={(e) => setNewAsset({ ...newAsset, format: e.target.value })}
                />
              </div>
              
              <div className="grid gap-2">
                <Label>URL (optional)</Label>
                <Input
                  placeholder="/admin/schemas/visualizer or https://..."
                  value={newAsset.url}
                  onChange={(e) => setNewAsset({ ...newAsset, url: e.target.value })}
                />
              </div>
            </div>
            
            {uploading && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Uploading...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={uploading}>
              {uploading ? "Saving..." : "Add Asset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Asset</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedAsset?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Asset Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-[700px]">
          {selectedAsset && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  {getTypeIcon(selectedAsset.type)}
                  <DialogTitle>{selectedAsset.name}</DialogTitle>
                  <Badge className={getStatusColor(selectedAsset.status)}>
                    {selectedAsset.status}
                  </Badge>
                </div>
                <DialogDescription>
                  Version {selectedAsset.version} • Updated {formatDate(selectedAsset.updatedAt)}
                </DialogDescription>
              </DialogHeader>
              
              <Tabs defaultValue="details" className="mt-4">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="metadata">Metadata</TabsTrigger>
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                </TabsList>
                
                <TabsContent value="details" className="space-y-4 mt-4">
                  <div>
                    <h4 className="text-sm font-medium mb-2">Description</h4>
                    <p className="text-sm text-muted-foreground">{selectedAsset.description}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-sm font-medium mb-2">Properties</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Type:</span>
                          <span className="capitalize">{selectedAsset.type}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Category:</span>
                          <span>{selectedAsset.category}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Size:</span>
                          <span>{formatBytes(selectedAsset.size)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Format:</span>
                          <span>{selectedAsset.format || "N/A"}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="text-sm font-medium mb-2">Ownership</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Owner:</span>
                          <span>{selectedAsset.owner}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Created:</span>
                          <span>{formatDate(selectedAsset.createdAt)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Last Modified:</span>
                          <span>{formatDate(selectedAsset.updatedAt)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium mb-2">Tags</h4>
                    <div className="flex flex-wrap gap-1">
                      {selectedAsset.tags.map((tag) => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  
                  {selectedAsset.url && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">External Link</h4>
                      <a
                        href={selectedAsset.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                      >
                        {selectedAsset.url}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="metadata" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-sm font-medium">Schema Version</span>
                      <span className="text-sm">v{selectedAsset.version}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-sm font-medium">Content Type</span>
                      <span className="text-sm">{selectedAsset.type}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-sm font-medium">Storage Location</span>
                      <span className="font-mono text-xs">
                        {selectedAsset.derived
                          ? `postgres://schema/${selectedAsset.id.replace(/^schema:/, "")}`
                          : `powerbuddy://library/${selectedAsset.id.replace(/^db:/, "")}`}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-sm font-medium">Encryption</span>
                      <span className="text-sm">AES-256</span>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="activity" className="space-y-4 mt-4">
                  <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Download className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Downloads</p>
                        <p className="text-2xl font-bold">{selectedAsset.downloads.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Eye className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Views</p>
                        <p className="text-2xl font-bold">{selectedAsset.views.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium mb-2">Recent Activity</h4>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-3 w-3" />
                        <span>Downloaded by admins and DB owners in the last 30 days</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-3 w-3" />
                        <span>Last accessed: {formatDate(selectedAsset.updatedAt)}</span>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setShareOpen(true)}>
                  <Share2 className="mr-2 h-4 w-4" />
                  Share
                </Button>
                <Button>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Create Folder Dialog */}
      <Dialog open={createFolderOpen} onOpenChange={setCreateFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>
              Group exports, migrations, and docs into folders for your workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Folder Name</Label>
              <Input
                placeholder="e.g., Schema Exports"
                value={newFolder.name}
                onChange={(e) => setNewFolder({ ...newFolder, name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Parent Path</Label>
              <Select
                value={newFolder.path}
                onValueChange={(value) => setNewFolder({ ...newFolder, path: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="/">Root (/)</SelectItem>
                  {folders.map((folder) => (
                    <SelectItem key={folder.id} value={folder.path}>
                      {folder.path}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateFolderOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolder}>
              Create Folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Share Dialog */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Asset</DialogTitle>
            <DialogDescription>
              Share "{selectedAsset?.name}" with other users.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Email address</Label>
              <Input
                placeholder="colleague@company.com"
                value={shareEmail}
                onChange={(e) => setShareEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Permission level</Label>
              <Select value={sharePermission} onValueChange={(v: any) => setSharePermission(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">Can view</SelectItem>
                  <SelectItem value="edit">Can edit</SelectItem>
                  <SelectItem value="admin">Full access</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              toast.success(`Shared with ${shareEmail}`)
              setShareOpen(false)
              setShareEmail("")
            }}>
              Share
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}