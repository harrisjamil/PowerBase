"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from 'sonner'
import { 
  Database, 
  Search, 
  RefreshCw,
  Table,
  User,
  Hash,
  Calendar,
  Layers,
  Loader2,
  Eye,
  ChevronRight,
  ChevronDown,
  Package,
  Box,
  Plus,
  Edit,
  Trash2,
  AlertTriangle,
  Copy,
  Download,
  Info,
  Maximize2,
  FileJson,
  FileText,
  FileSpreadsheet,
  Key,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu"

interface Schema {
  schema_name: string
  owner: string
  owner_id: number
  table_count: number
  total_size: string
  description: string | null
}

interface Table {
  table_name: string
  table_type: string
  row_count: number
  table_size: string
  description: string | null
}

interface Column {
  column_name: string
  data_type: string
  is_nullable: string
  column_default: string | null
  is_primary_key: boolean
}

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  table: Table | null
  schemaName: string | null
}

export default function SchemasPage() {
  const [schemas, setSchemas] = useState<Schema[]>([])
  const [controlSchemaName, setControlSchemaName] = useState<string | null>(null)
  const [dbUsers, setDbUsers] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const [selectedSchema, setSelectedSchema] = useState<Schema | null>(null)
  const [selectedTable, setSelectedTable] = useState<Table | null>(null)
  const router = useRouter()
  // Store tables per schema
  const [schemaTablesMap, setSchemaTablesMap] = useState<{ [key: string]: Table[] }>({})
  const [loadingTablesMap, setLoadingTablesMap] = useState<{ [key: string]: boolean }>({})
  
  const [tableColumns, setTableColumns] = useState<Column[]>([])
  const [isSchemaDetailsOpen, setIsSchemaDetailsOpen] = useState(false)
  const [isTableDetailsOpen, setIsTableDetailsOpen] = useState(false)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set())
  const [isCreating, setIsCreating] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [cascadeDelete, setCascadeDelete] = useState(false)
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    table: null,
    schemaName: null
  })
  
  // Form data for create/edit
  const [formData, setFormData] = useState({
    schema_name: '',
    owner: '',
    description: ''
  })

  // Reference for context menu
  const contextMenuRef = useRef<HTMLDivElement>(null)

  // Fetch all schemas
  const fetchSchemas = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/schemas')
      const data = await response.json()
      
      if (data.success) {
        setSchemas(data.schemas)
        setControlSchemaName(
          typeof data.controlSchema === "string" ? data.controlSchema : null
        )
      } else {
        toast.error(data.error || 'Failed to fetch schemas')
      }
    } catch (error) {
      console.error('Error fetching schemas:', error)
      toast.error('Failed to fetch schemas')
    } finally {
      setLoading(false)
    }
  }

  // Fetch database users for owner dropdown
  const fetchDbUsers = async () => {
    try {
      const response = await fetch('/api/db-users')
      const data = await response.json()
      if (data.success) {
        setDbUsers(data.users.map((u: any) => u.username))
      }
    } catch (error) {
      console.error('Error fetching users:', error)
    }
  }

  // Fetch tables for a specific schema
  const fetchSchemaTables = async (schemaName: string) => {
    if (schemaTablesMap[schemaName]) {
      return schemaTablesMap[schemaName]
    }
    
    try {
      setLoadingTablesMap(prev => ({ ...prev, [schemaName]: true }))
      const response = await fetch(`/api/schemas/${encodeURIComponent(schemaName)}/tables`)
      const data = await response.json()
      
      if (data.success) {
        setSchemaTablesMap(prev => ({ ...prev, [schemaName]: data.tables }))
        return data.tables
      } else {
        console.error(`Failed to fetch tables for ${schemaName}:`, data.error)
        toast.error(data.error || `Failed to fetch tables for ${schemaName}`)
        return []
      }
    } catch (error) {
      console.error('Error fetching tables:', error)
      toast.error(`Failed to fetch tables for ${schemaName}`)
      return []
    } finally {
      setLoadingTablesMap(prev => ({ ...prev, [schemaName]: false }))
    }
  }

  // Fetch columns for a specific table
  const fetchTableColumns = async (schemaName: string, tableName: string) => {
    try {
      const response = await fetch(`/api/schemas/${encodeURIComponent(schemaName)}/tables/${encodeURIComponent(tableName)}/columns`)
      const data = await response.json()
      
      if (data.success) {
        setTableColumns(data.columns)
      } else {
        console.error(`Failed to fetch columns for ${tableName}:`, data.error)
        toast.error(data.error || `Failed to fetch columns for ${tableName}`)
      }
    } catch (error) {
      console.error('Error fetching columns:', error)
      toast.error(`Failed to fetch columns for ${tableName}`)
    }
  }

  // Copy table name to clipboard
  const copyTableName = async (tableName: string) => {
    try {
      await navigator.clipboard.writeText(tableName)
      toast.success(`Table name "${tableName}" copied to clipboard`)
    } catch (error) {
      toast.error('Failed to copy table name')
    }
  }

  // Generate SQL SELECT statement
  const generateSelectSQL = (schemaName: string, tableName: string) => {
    const sql = `SELECT * FROM "${schemaName}"."${tableName}" LIMIT 100;`
    navigator.clipboard.writeText(sql)
    toast.success('SQL SELECT statement copied to clipboard')
  }

  // Generate SQL COUNT statement
  const generateCountSQL = (schemaName: string, tableName: string) => {
    const sql = `SELECT COUNT(*) FROM "${schemaName}"."${tableName}";`
    navigator.clipboard.writeText(sql)
    toast.success('SQL COUNT statement copied to clipboard')
  }

  // Export table data as JSON
  const exportTableAsJSON = async (schemaName: string, tableName: string) => {
    try {
      const response = await fetch(`/api/schemas/${encodeURIComponent(schemaName)}/tables/${encodeURIComponent(tableName)}/data`)
      if (response.ok) {
        const data = await response.json()
        const jsonStr = JSON.stringify(data, null, 2)
        const blob = new Blob([jsonStr], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${schemaName}_${tableName}.json`
        a.click()
        URL.revokeObjectURL(url)
        toast.success(`Table "${tableName}" exported as JSON`)
      } else {
        toast.error('Failed to export table data')
      }
    } catch (error) {
      toast.error('Failed to export table data')
    }
  }

  // Handle right-click
  const handleContextMenu = (e: React.MouseEvent, schemaName: string, table: Table) => {
    e.preventDefault()
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      table: table,
      schemaName: schemaName
    })
  }

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenu(prev => ({ ...prev, visible: false }))
  }, [])

  // Handle click outside to close context menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        closeContextMenu()
      }
    }
    
    if (contextMenu.visible) {
      document.addEventListener('click', handleClickOutside)
      document.addEventListener('scroll', closeContextMenu)
      return () => {
        document.removeEventListener('click', handleClickOutside)
        document.removeEventListener('scroll', closeContextMenu)
      }
    }
  }, [contextMenu.visible, closeContextMenu])

  const refreshData = async () => {
    setRefreshing(true)
    await fetchSchemas()
    setSchemaTablesMap({})
    setExpandedSchemas(new Set())
    setRefreshing(false)
  }

  useEffect(() => {
    fetchSchemas()
    fetchDbUsers()
  }, [])

  const toggleSchema = async (schemaName: string) => {
    const newExpanded = new Set(expandedSchemas)
    
    if (newExpanded.has(schemaName)) {
      newExpanded.delete(schemaName)
      setExpandedSchemas(newExpanded)
    } else {
      newExpanded.add(schemaName)
      setExpandedSchemas(newExpanded)
      await fetchSchemaTables(schemaName)
    }
  }

  const handleViewSchema = (schema: Schema) => {
    router.push(`/admin/schemas/${schema.schema_name}`)
  }

  const handleViewTable = async (schemaName: string, table: Table) => {
    setSelectedTable(table)
    await fetchTableColumns(schemaName, table.table_name)
    setIsTableDetailsOpen(true)
  }

  const handleCreateSchema = async () => {
    if (!formData.schema_name) {
      toast.error('Schema name is required')
      return
    }

    setIsCreating(true)
    try {
      const response = await fetch('/api/schemas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      
      const data = await response.json()
      
      if (data.success) {
        toast.success(`Schema ${formData.schema_name} created successfully`)
        setIsCreateDialogOpen(false)
        resetForm()
        await fetchSchemas()
      } else {
        throw new Error(data.error)
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to create schema')
    } finally {
      setIsCreating(false)
    }
  }

  const handleEditSchema = async () => {
    if (!selectedSchema) return

    setIsUpdating(true)
    try {
      const response = await fetch('/api/schemas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          old_name: selectedSchema.schema_name,
          new_name: formData.schema_name,
          owner: formData.owner,
          description: formData.description
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        toast.success(`Schema updated successfully`)
        setIsEditDialogOpen(false)
        resetForm()
        await fetchSchemas()
        setSchemaTablesMap(prev => {
          const newMap = { ...prev }
          delete newMap[selectedSchema.schema_name]
          return newMap
        })
      } else {
        throw new Error(data.error)
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to update schema')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDeleteSchema = async () => {
    if (!selectedSchema) return

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/schemas?schema_name=${encodeURIComponent(selectedSchema.schema_name)}&cascade=${cascadeDelete}`, {
        method: 'DELETE'
      })
      
      const data = await response.json()
      
      if (data.success) {
        toast.success(`Schema ${selectedSchema.schema_name} deleted successfully`)
        setIsDeleteDialogOpen(false)
        setSelectedSchema(null)
        await fetchSchemas()
        setSchemaTablesMap(prev => {
          const newMap = { ...prev }
          delete newMap[selectedSchema.schema_name]
          return newMap
        })
      } else {
        throw new Error(data.error)
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete schema')
    } finally {
      setIsDeleting(false)
    }
  }

  const openEditDialog = (schema: Schema) => {
    setSelectedSchema(schema)
    setFormData({
      schema_name: schema.schema_name,
      owner: schema.owner,
      description: schema.description || ''
    })
    setIsEditDialogOpen(true)
  }

  const openDeleteDialog = (schema: Schema) => {
    setSelectedSchema(schema)
    setCascadeDelete(false)
    setIsDeleteDialogOpen(true)
  }

  const resetForm = () => {
    setFormData({
      schema_name: '',
      owner: '',
      description: ''
    })
    setSelectedSchema(null)
  }

  const filteredSchemas = schemas.filter(schema =>
    schema.schema_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (schema.description && schema.description.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const getSchemaIcon = (schemaName: string) => {
    if (schemaName === 'public') return <Database className="h-5 w-5 text-blue-500" />
    if (schemaName === 'information_schema') return <Layers className="h-5 w-5 text-purple-500" />
    if (schemaName === 'pg_catalog') return <Package className="h-5 w-5 text-orange-500" />
    return <Box className="h-5 w-5 text-green-500" />
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Database Schemas</h1>
          <p className="text-sm text-muted-foreground">
            View, create, edit, and delete database schemas
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={refreshData} disabled={refreshing} variant="outline" className="gap-2">
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>
          <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Schema
          </Button>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search schemas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
        </CardContent>
      </Card>

      {/* Schemas List */}
      <Card>
        <CardHeader>
          <CardTitle>All Schemas</CardTitle>
          <CardDescription>
            Showing {filteredSchemas.length} of {schemas.length} schemas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredSchemas.map((schema) => {
              const isControlSchema =
                controlSchemaName !== null && schema.schema_name === controlSchemaName

              return (
              <div key={schema.schema_name} className="rounded-lg border">
                {/* Schema Header */}
                <div 
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleSchema(schema.schema_name)}
                >
                  <div className="flex items-center gap-3">
                    {expandedSchemas.has(schema.schema_name) ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    {getSchemaIcon(schema.schema_name)}
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{schema.schema_name}</h3>
                        {isControlSchema && (
                          <Badge variant="outline" className="border-primary/40 text-primary">
                            Platform
                          </Badge>
                        )}
                        <Badge variant="secondary">{schema.table_count} {schema.table_count === 1 ? 'table' : 'tables'}</Badge>
                      </div>
                      {schema.description && (
                        <p className="text-sm text-muted-foreground">{schema.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-sm font-medium">{schema.total_size}</div>
                      <div className="text-xs text-muted-foreground">Owner: {schema.owner}</div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        router.push(`/admin/schemas/${schema.schema_name}`)
                      }}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                    {!isControlSchema && (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          openEditDialog(schema)
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    )}
                    {schema.schema_name !== 'public' && !isControlSchema && (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={(e) => {
                          e.stopPropagation()
                          openDeleteDialog(schema)
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Expanded Tables with Context Menu */}
                {expandedSchemas.has(schema.schema_name) && (
                  <div className="border-t p-4 bg-muted/30">
                    {loadingTablesMap[schema.schema_name] ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : (schemaTablesMap[schema.schema_name] || []).length > 0 ? (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium mb-3">Tables in {schema.schema_name}</h4>
                        {(schemaTablesMap[schema.schema_name] || []).map((table) => (
                          <div 
                            key={table.table_name}
                            className="flex items-center justify-between p-3 bg-background rounded-lg border hover:shadow-sm transition-shadow"
                            onContextMenu={(e) => handleContextMenu(e, schema.schema_name, table)}
                          >
                            <div className="flex items-center gap-3">
                              <Table className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <div className="font-medium">{table.table_name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {table.table_type === 'BASE TABLE' ? 'Table' : table.table_type}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <div className="text-sm">{table.row_count.toLocaleString()} rows</div>
                                <div className="text-xs text-muted-foreground">{table.table_size}</div>
                              </div>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => handleViewTable(schema.schema_name, table)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        No tables found in this schema
                      </div>
                    )}
                  </div>
                )}
              </div>
            )})}
          </div>
        </CardContent>
      </Card>

      {/* Custom Context Menu */}
      {contextMenu.visible && contextMenu.table && contextMenu.schemaName && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 min-w-[200px] overflow-hidden rounded-md border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground border-b mb-1">
            {contextMenu.table.table_name}
          </div>
          
          <button
            className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground gap-2"
            onClick={() => {
              handleViewTable(contextMenu.schemaName!, contextMenu.table!)
              closeContextMenu()
            }}
          >
            <Eye className="h-4 w-4" />
            <span>View Details</span>
          </button>
          
          <button
            className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground gap-2"
            onClick={() => {
              copyTableName(contextMenu.table!.table_name)
              closeContextMenu()
            }}
          >
            <Copy className="h-4 w-4" />
            <span>Copy Table Name</span>
          </button>
          
          <div className="relative">
            <button
              className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground gap-2"
              onClick={() => {}}
            >
              <FileText className="h-4 w-4" />
              <span>Generate SQL</span>
              <ChevronRight className="ml-auto h-4 w-4" />
            </button>
            
            <div className="absolute left-full top-0 ml-1 hidden group-hover:block hover:block">
              <div className="min-w-[180px] overflow-hidden rounded-md border bg-popover p-1 shadow-md">
                <button
                  className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    generateSelectSQL(contextMenu.schemaName!, contextMenu.table!.table_name)
                    closeContextMenu()
                  }}
                >
                  SELECT * FROM table LIMIT 100
                </button>
                <button
                  className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    generateCountSQL(contextMenu.schemaName!, contextMenu.table!.table_name)
                    closeContextMenu()
                  }}
                >
                  SELECT COUNT(*) FROM table
                </button>
              </div>
            </div>
          </div>
          
          <div className="relative">
            <button
              className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground gap-2"
              onClick={() => {}}
            >
              <Download className="h-4 w-4" />
              <span>Export</span>
              <ChevronRight className="ml-auto h-4 w-4" />
            </button>
            
            <div className="absolute left-full top-0 ml-1 hidden group-hover:block hover:block">
              <div className="min-w-[180px] overflow-hidden rounded-md border bg-popover p-1 shadow-md">
                <button
                  className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground gap-2"
                  onClick={() => {
                    exportTableAsJSON(contextMenu.schemaName!, contextMenu.table!.table_name)
                    closeContextMenu()
                  }}
                >
                  <FileJson className="h-4 w-4" />
                  Export as JSON
                </button>
                <button
                  className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground gap-2"
                  onClick={() => {
                    toast.info('CSV export coming soon')
                    closeContextMenu()
                  }}
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Export as CSV
                </button>
              </div>
            </div>
          </div>
          
          <button
            className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground gap-2"
            onClick={() => {
              setSelectedTable(contextMenu.table!)
              fetchTableColumns(contextMenu.schemaName!, contextMenu.table!.table_name)
              setIsTableDetailsOpen(true)
              closeContextMenu()
            }}
          >
            <Info className="h-4 w-4" />
            <span>Table Info</span>
          </button>
          
          <ContextMenuSeparator className="my-1" />
          
          <button
            className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none text-red-600 hover:bg-red-50 hover:text-red-700 gap-2"
            onClick={() => {
              toast.error(`Delete table feature coming soon: ${contextMenu.table!.table_name}`)
              closeContextMenu()
            }}
          >
            <Trash2 className="h-4 w-4" />
            <span>Delete Table</span>
          </button>
        </div>
      )}

      {/* Create Schema Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Schema</DialogTitle>
            <DialogDescription>
              Create a new database schema
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="schema_name">Schema Name *</Label>
              <Input
                id="schema_name"
                value={formData.schema_name}
                onChange={(e) => setFormData({...formData, schema_name: e.target.value})}
                placeholder="Enter schema name"
                className="mt-1"
                disabled={isCreating}
              />
            </div>
            
            <div>
              <Label htmlFor="owner">Owner</Label>
              <Select 
                value={formData.owner} 
                onValueChange={(value) => setFormData({...formData, owner: value})}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select owner (default: postgres)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="postgres">postgres</SelectItem>
                  {dbUsers.map(user => (
                    <SelectItem key={user} value={user}>{user}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder="Enter schema description"
                className="mt-1"
                rows={3}
                disabled={isCreating}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsCreateDialogOpen(false)
              resetForm()
            }} disabled={isCreating}>
              Cancel
            </Button>
            <Button onClick={handleCreateSchema} disabled={isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Schema'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Schema Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Schema</DialogTitle>
            <DialogDescription>
              Update schema name, owner, or description
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit_schema_name">Schema Name</Label>
              <Input
                id="edit_schema_name"
                value={formData.schema_name}
                onChange={(e) => setFormData({...formData, schema_name: e.target.value})}
                placeholder="Enter schema name"
                className="mt-1"
                disabled={isUpdating}
              />
            </div>
            
            <div>
              <Label htmlFor="edit_owner">Owner</Label>
              <Select 
                value={formData.owner} 
                onValueChange={(value) => setFormData({...formData, owner: value})}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select owner" />
                </SelectTrigger>
                <SelectContent>
                  {dbUsers.map(user => (
                    <SelectItem key={user} value={user}>{user}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="edit_description">Description</Label>
              <Textarea
                id="edit_description"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder="Enter schema description"
                className="mt-1"
                rows={3}
                disabled={isUpdating}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsEditDialogOpen(false)
              resetForm()
            }} disabled={isUpdating}>
              Cancel
            </Button>
            <Button onClick={handleEditSchema} disabled={isUpdating}>
              {isUpdating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Schema'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Schema Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Delete Schema
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          {selectedSchema && (
            <div className="space-y-4">
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800">
                  You are about to delete schema: <span className="font-semibold">{selectedSchema.schema_name}</span>
                </p>
                {selectedSchema.table_count > 0 && (
                  <p className="text-sm text-red-700 mt-2">
                    Warning: This schema contains {selectedSchema.table_count} {selectedSchema.table_count === 1 ? 'table' : 'tables'}.
                  </p>
                )}
              </div>
              
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="cascade"
                  checked={cascadeDelete}
                  onChange={(e) => setCascadeDelete(e.target.checked)}
                  className="h-4 w-4"
                />
                <Label htmlFor="cascade" className="text-sm font-normal">
                  Cascade delete (also delete all objects in this schema)
                </Label>
              </div>
              
              <p className="text-sm text-muted-foreground">
                {cascadeDelete 
                  ? "All tables, views, and other objects in this schema will be permanently deleted."
                  : "Delete will fail if the schema contains any objects."}
              </p>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteSchema} disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Schema'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schema Details Dialog */}
      <Dialog open={isSchemaDetailsOpen} onOpenChange={setIsSchemaDetailsOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedSchema && getSchemaIcon(selectedSchema.schema_name)}
              Schema: {selectedSchema?.schema_name}
            </DialogTitle>
            <DialogDescription>
              Detailed information about the schema and its tables
            </DialogDescription>
          </DialogHeader>
          
          {selectedSchema && (
            <div className="space-y-6">
              <div className="grid gap-4">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Owner:</span>
                  <span className="font-medium">{selectedSchema.owner}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Total Tables:</span>
                  <span className="font-medium">{selectedSchema.table_count}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Total Size:</span>
                  <span className="font-medium">{selectedSchema.total_size}</span>
                </div>
                {selectedSchema.description && (
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Description:</span>
                    <span className="font-medium">{selectedSchema.description}</span>
                  </div>
                )}
              </div>

              <div>
                <h3 className="font-semibold mb-3">Tables</h3>
                <div className="space-y-2">
                  {(schemaTablesMap[selectedSchema.schema_name] || []).map((table) => (
                    <div 
                      key={table.table_name}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                      onClick={() => {
                        handleViewTable(selectedSchema.schema_name, table)
                        setIsSchemaDetailsOpen(false)
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <Table className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium">{table.table_name}</div>
                          <div className="text-xs text-muted-foreground">{table.table_type}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm">{table.row_count.toLocaleString()} rows</div>
                        <div className="text-xs text-muted-foreground">{table.table_size}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Table Details Dialog */}
      <Dialog open={isTableDetailsOpen} onOpenChange={setIsTableDetailsOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Table className="h-5 w-5" />
              Table: {selectedTable?.table_name}
            </DialogTitle>
            <DialogDescription>
              Column details and table information
            </DialogDescription>
          </DialogHeader>
          
          {selectedTable && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                <div>
                  <div className="text-sm text-muted-foreground">Table Type</div>
                  <div className="font-medium">{selectedTable.table_type}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Total Rows</div>
                  <div className="font-medium">{selectedTable.row_count.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Table Size</div>
                  <div className="font-medium">{selectedTable.table_size}</div>
                </div>
                {selectedTable.description && (
                  <div className="col-span-2">
                    <div className="text-sm text-muted-foreground">Description</div>
                    <div className="font-medium">{selectedTable.description}</div>
                  </div>
                )}
              </div>

              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  Columns ({tableColumns.length})
                </h3>
                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full min-w-[600px]">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-3 font-medium">Column Name</th>
                        <th className="text-left p-3 font-medium">Data Type</th>
                        <th className="text-left p-3 font-medium">Nullable</th>
                        <th className="text-left p-3 font-medium">Primary Key</th>
                        <th className="text-left p-3 font-medium">Default Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableColumns.map((column, index) => (
                        <tr key={column.column_name} className={index % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                          <td className="p-3 font-mono text-sm">{column.column_name}</td>
                          <td className="p-3">
                            <Badge variant="outline">{column.data_type}</Badge>
                          </td>
                          <td className="p-3">
                            {column.is_nullable === 'YES' ? (
                              <span className="text-green-600">Yes</span>
                            ) : (
                              <span className="text-red-600">No</span>
                            )}
                          </td>
                          <td className="p-3">
                            {column.is_primary_key ? (
                              <Key className="h-4 w-4 text-yellow-600" />
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="p-3 text-sm text-muted-foreground">
                            {column.column_default || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}