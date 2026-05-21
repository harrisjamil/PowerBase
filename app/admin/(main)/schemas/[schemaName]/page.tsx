"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { toast } from 'sonner'
import { 
  Table as TableIcon,
  Database,
  Key,
  Loader2,
  Eye,
  ArrowLeft,
  RefreshCw,
  Search,
  Copy,
  Download,
  FileJson,
  FileText,
  Plus,
  Edit,
  Trash2,
  AlertTriangle,
  X,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  ExternalLink,
  Play,
  Save,
  Columns,
  Link2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SchemaTableDataEditor } from "@/components/schema-table-data-editor"


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

interface SchemaInfo {
  schema_name: string
  owner: string
  table_count: number
  total_size: string
  description: string | null
}

const dataTypes = [
  'VARCHAR(255)',
  'VARCHAR(500)',
  'TEXT',
  'INTEGER',
  'BIGINT',
  'DECIMAL(10,2)',
  'BOOLEAN',
  'DATE',
  'TIMESTAMP',
  'JSON',
  'JSONB',
  'UUID',
  'SERIAL',
  'BIGSERIAL'
]

export default function SchemaTablesPage() {
  const params = useParams()
  const router = useRouter()
  const schemaName = params.schemaName as string
  
  const [schema, setSchema] = useState<SchemaInfo | null>(null)
  const [tables, setTables] = useState<Table[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedTable, setSelectedTable] = useState<Table | null>(null)
  const [activeTable, setActiveTable] = useState<Table | null>(null)
  const [tableColumns, setTableColumns] = useState<Column[]>([])
  const [isTableDetailsOpen, setIsTableDetailsOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  
  // Column CRUD states
  const [isAddColumnOpen, setIsAddColumnOpen] = useState(false)
  const [isEditColumnOpen, setIsEditColumnOpen] = useState(false)
  const [isDeleteColumnOpen, setIsDeleteColumnOpen] = useState(false)
  const [selectedColumn, setSelectedColumn] = useState<Column | null>(null)
  const [isAddingColumn, setIsAddingColumn] = useState(false)
  const [isUpdatingColumn, setIsUpdatingColumn] = useState(false)
  const [isDeletingColumn, setIsDeletingColumn] = useState(false)
  const [columnFormData, setColumnFormData] = useState({
    column_name: '',
    data_type: 'VARCHAR(255)',
    is_nullable: true,
    column_default: ''
  })

  // Table CRUD states
  const [isCreateTableOpen, setIsCreateTableOpen] = useState(false)
  const [isDeleteTableOpen, setIsDeleteTableOpen] = useState(false)
  const [isCreatingTable, setIsCreatingTable] = useState(false)
  const [isDeletingTable, setIsDeletingTable] = useState(false)
  const [tableToDelete, setTableToDelete] = useState<Table | null>(null)
  const [tableFormData, setTableFormData] = useState({
    table_name: '',
    description: '',
    columns: [{ 
      column_name: '', 
      data_type: 'VARCHAR(255)', 
      is_nullable: true, 
      column_default: '', 
      is_primary_key: false 
    }]
  })

  // Fetch schema info and tables
  const fetchSchemaData = async () => {
    try {
      setLoading(true)
      
      // Fetch schema info
      const schemaResponse = await fetch('/api/schemas')
      const schemasData = await schemaResponse.json()
      const currentSchema = schemasData.schemas?.find((s: any) => s.schema_name === schemaName)
      setSchema(currentSchema || null)
      
      // Fetch tables
      const tablesResponse = await fetch(`/api/schemas/${encodeURIComponent(schemaName)}/tables`)
      const tablesData = await tablesResponse.json()
      
      if (tablesData.success) {
        const nextTables = tablesData.tables as Table[]
        setTables(nextTables)
        setActiveTable((current) => {
          if (current && nextTables.some((t) => t.table_name === current.table_name)) {
            return current
          }
          return nextTables[0] ?? null
        })
      } else {
        toast.error(tablesData.error || 'Failed to fetch tables')
      }
    } catch (error) {
      console.error('Error fetching schema data:', error)
      toast.error('Failed to fetch schema data')
    } finally {
      setLoading(false)
    }
  }

  // Fetch columns for a specific table
  const fetchTableColumns = async (tableName: string) => {
    try {
      const response = await fetch(`/api/schemas/${encodeURIComponent(schemaName)}/tables/${encodeURIComponent(tableName)}/columns`)
      const data = await response.json()
      
      if (data.success) {
        setTableColumns(data.columns)
      } else {
        toast.error(data.error || `Failed to fetch columns for ${tableName}`)
      }
    } catch (error) {
      console.error('Error fetching columns:', error)
      toast.error(`Failed to fetch columns for ${tableName}`)
    }
  }

  const refreshData = async () => {
    setRefreshing(true)
    await fetchSchemaData()
    setRefreshing(false)
  }

  useEffect(() => {
    fetchSchemaData()
  }, [schemaName])

  const handleSelectTable = (table: Table) => {
    setActiveTable(table)
  }

  const handleViewColumns = async (table: Table, event?: React.MouseEvent) => {
    event?.stopPropagation()
    setSelectedTable(table)
    await fetchTableColumns(table.table_name)
    setIsTableDetailsOpen(true)
  }

  const handleRowCountChange = (delta: number) => {
    if (!activeTable) return
    setTables((current) =>
      current.map((table) =>
        table.table_name === activeTable.table_name
          ? { ...table, row_count: Math.max(table.row_count + delta, 0) }
          : table
      )
    )
    setActiveTable((current) =>
      current ? { ...current, row_count: Math.max(current.row_count + delta, 0) } : current
    )
  }

  // Copy table name to clipboard
  const copyTableName = async (tableName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(tableName)
      toast.success(`Table name "${tableName}" copied to clipboard`)
    } catch (error) {
      toast.error('Failed to copy table name')
    }
  }

  // Generate SQL SELECT statement
  const generateSelectSQL = (tableName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const sql = `SELECT * FROM "${schemaName}"."${tableName}" LIMIT 100;`
    navigator.clipboard.writeText(sql)
    toast.success('SQL SELECT statement copied to clipboard')
  }

  // Generate SQL COUNT statement
  const generateCountSQL = (tableName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const sql = `SELECT COUNT(*) FROM "${schemaName}"."${tableName}";`
    navigator.clipboard.writeText(sql)
    toast.success('SQL COUNT statement copied to clipboard')
  }

  // Export table data as JSON
  const exportTableAsJSON = async (tableName: string, e: React.MouseEvent) => {
    e.stopPropagation()
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

  // Column CRUD functions
  const handleAddColumn = async () => {
    if (!columnFormData.column_name) {
      toast.error('Column name is required')
      return
    }

    setIsAddingColumn(true)
    try {
      const response = await fetch(`/api/schemas/${encodeURIComponent(schemaName)}/tables/${encodeURIComponent(selectedTable!.table_name)}/columns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(columnFormData)
      })
      
      const data = await response.json()
      
      if (data.success) {
        toast.success(`Column ${columnFormData.column_name} added successfully`)
        setIsAddColumnOpen(false)
        resetColumnForm()
        await fetchTableColumns(selectedTable!.table_name)
      } else {
        throw new Error(data.error)
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to add column')
    } finally {
      setIsAddingColumn(false)
    }
  }

  const handleEditColumn = async () => {
    if (!selectedColumn) return

    setIsUpdatingColumn(true)
    try {
      const response = await fetch(`/api/schemas/${encodeURIComponent(schemaName)}/tables/${encodeURIComponent(selectedTable!.table_name)}/columns`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          old_name: selectedColumn.column_name,
          new_name: columnFormData.column_name,
          data_type: columnFormData.data_type,
          is_nullable: columnFormData.is_nullable,
          column_default: columnFormData.column_default
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        toast.success(`Column updated successfully`)
        setIsEditColumnOpen(false)
        resetColumnForm()
        await fetchTableColumns(selectedTable!.table_name)
      } else {
        throw new Error(data.error)
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to update column')
    } finally {
      setIsUpdatingColumn(false)
    }
  }

  const handleDeleteColumn = async () => {
    if (!selectedColumn) return

    setIsDeletingColumn(true)
    try {
      const response = await fetch(`/api/schemas/${encodeURIComponent(schemaName)}/tables/${encodeURIComponent(selectedTable!.table_name)}/columns?column_name=${encodeURIComponent(selectedColumn.column_name)}`, {
        method: 'DELETE'
      })
      
      const data = await response.json()
      
      if (data.success) {
        toast.success(`Column ${selectedColumn.column_name} deleted successfully`)
        setIsDeleteColumnOpen(false)
        setSelectedColumn(null)
        await fetchTableColumns(selectedTable!.table_name)
      } else {
        throw new Error(data.error)
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete column')
    } finally {
      setIsDeletingColumn(false)
    }
  }

  // Table CRUD functions
  const handleCreateTable = async () => {
    if (!tableFormData.table_name) {
      toast.error('Table name is required')
      return
    }

    if (tableFormData.columns.length === 0 || !tableFormData.columns[0].column_name) {
      toast.error('At least one column is required')
      return
    }

    setIsCreatingTable(true)
    try {
      const response = await fetch(`/api/schemas/${encodeURIComponent(schemaName)}/tables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tableFormData)
      })
      
      const data = await response.json()
      
      if (data.success) {
        toast.success(`Table ${tableFormData.table_name} created successfully`)
        setIsCreateTableOpen(false)
        resetTableForm()
        await fetchSchemaData()
      } else {
        throw new Error(data.error)
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to create table')
    } finally {
      setIsCreatingTable(false)
    }
  }

  const handleDeleteTable = async () => {
    if (!tableToDelete) return

    setIsDeletingTable(true)
    try {
      const response = await fetch(`/api/schemas/${encodeURIComponent(schemaName)}/tables?table_name=${encodeURIComponent(tableToDelete.table_name)}&cascade=false`, {
        method: 'DELETE'
      })
      
      const data = await response.json()
      
      if (data.success) {
        toast.success(`Table ${tableToDelete.table_name} deleted successfully`)
        setIsDeleteTableOpen(false)
        setTableToDelete(null)
        await fetchSchemaData()
      } else {
        throw new Error(data.error)
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete table')
    } finally {
      setIsDeletingTable(false)
    }
  }

  const openAddColumnDialog = () => {
    resetColumnForm()
    setIsAddColumnOpen(true)
  }

  const openEditColumnDialog = (column: Column) => {
    setSelectedColumn(column)
    setColumnFormData({
      column_name: column.column_name,
      data_type: column.data_type,
      is_nullable: column.is_nullable === 'YES',
      column_default: column.column_default || ''
    })
    setIsEditColumnOpen(true)
  }

  const openDeleteColumnDialog = (column: Column) => {
    setSelectedColumn(column)
    setIsDeleteColumnOpen(true)
  }

  const openDeleteTableDialog = (table: Table) => {
    setTableToDelete(table)
    setIsDeleteTableOpen(true)
  }

  const resetColumnForm = () => {
    setColumnFormData({
      column_name: '',
      data_type: 'VARCHAR(255)',
      is_nullable: true,
      column_default: ''
    })
    setSelectedColumn(null)
  }

  const addTableColumn = () => {
    setTableFormData({
      ...tableFormData,
      columns: [...tableFormData.columns, { 
        column_name: '', 
        data_type: 'VARCHAR(255)', 
        is_nullable: true, 
        column_default: '',
        is_primary_key: false
      }]
    })
  }

  const removeTableColumn = (index: number) => {
    const newColumns = tableFormData.columns.filter((_, i) => i !== index)
    setTableFormData({ ...tableFormData, columns: newColumns })
  }

  const updateTableColumn = (index: number, field: string, value: any) => {
    const newColumns = [...tableFormData.columns]
    newColumns[index] = { ...newColumns[index], [field]: value }
    setTableFormData({ ...tableFormData, columns: newColumns })
  }

  const resetTableForm = () => {
    setTableFormData({
      table_name: '',
      description: '',
      columns: [{ 
        column_name: '', 
        data_type: 'VARCHAR(255)', 
        is_nullable: true, 
        column_default: '', 
        is_primary_key: false 
      }]
    })
  }

  const filteredTables = tables.filter(table =>
    table.table_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (table.description && table.description.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const getTableTypeColor = (type: string) => {
    if (type === 'BASE TABLE') return 'bg-blue-100 text-blue-800'
    if (type === 'VIEW') return 'bg-green-100 text-green-800'
    if (type === 'MATERIALIZED VIEW') return 'bg-purple-100 text-purple-800'
    return 'bg-gray-100 text-gray-800'
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => router.back()}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-500" />
              <h1 className="text-lg font-semibold tracking-tight">{schemaName}</h1>
              <Badge variant="secondary">{tables.length} tables</Badge>
            </div>
            {schema?.description && (
              <p className="text-sm text-muted-foreground mt-1">{schema.description}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setIsCreateTableOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Table
          </Button>
          <Button onClick={refreshData} disabled={refreshing} variant="outline" className="gap-2">
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {/* Schema Info Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Owner</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{schema?.owner || 'N/A'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Size</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{schema?.total_size || '0 bytes'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Tables</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{schema?.table_count || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tables..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
        </CardContent>
      </Card>

      {/* Tables + data editor */}
      <div className="flex min-h-[640px] flex-col gap-4 lg:flex-row">
        <Card className="w-full shrink-0 lg:w-80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tables</CardTitle>
            <CardDescription>
              {filteredTables.length} of {tables.length} in {schemaName}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {filteredTables.length === 0 ? (
              <div className="px-4 pb-6 text-center text-muted-foreground">
                <TableIcon className="mx-auto mb-3 h-10 w-10 opacity-50" />
                <p className="text-sm">No tables found</p>
                <Button
                  onClick={() => setIsCreateTableOpen(true)}
                  variant="outline"
                  size="sm"
                  className="mt-3 gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Create table
                </Button>
              </div>
            ) : (
              <ScrollArea className="h-[560px] px-2 pb-2">
                <div className="space-y-2 p-1">
                  {filteredTables.map((table) => (
                <div
                  key={table.table_name}
                  className={`rounded-lg border p-3 transition-colors cursor-pointer ${
                    activeTable?.table_name === table.table_name
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => handleSelectTable(table)}
                >
                  <div className="flex items-center gap-4 flex-1">
                    <TableIcon className="h-8 w-8 text-muted-foreground" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-lg">{table.table_name}</h3>
                        <Badge className={getTableTypeColor(table.table_type)}>
                          {table.table_type === 'BASE TABLE' ? 'Table' : table.table_type}
                        </Badge>
                      </div>
                      {table.description && (
                        <p className="text-sm text-muted-foreground mt-1">{table.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>{table.row_count.toLocaleString()} rows</span>
                        <span>{table.table_size}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => handleViewColumns(table, e)}
                      className="h-7 gap-1 text-xs"
                    >
                      <Columns className="h-3 w-3" />
                      Columns
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={(e) => copyTableName(table.table_name, e)}
                      title="Copy table name"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={(e) => generateSelectSQL(table.table_name, e)}
                      title="Generate SELECT SQL"
                    >
                      <FileText className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={(e) => exportTableAsJSON(table.table_name, e)}
                      title="Export as JSON"
                    >
                      <Download className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                      onClick={(e) => {
                        e.stopPropagation()
                        openDeleteTableDialog(table)
                      }}
                      title="Delete table"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <div className="min-w-0 flex-1">
          {activeTable ? (
            <SchemaTableDataEditor
              schemaName={schemaName}
              tableName={activeTable.table_name}
              rowCount={activeTable.row_count}
              tableSize={activeTable.table_size}
              onRowCountChange={handleRowCountChange}
            />
          ) : (
            <Card className="flex h-full min-h-[560px] items-center justify-center">
              <CardContent className="py-12 text-center text-muted-foreground">
                <TableIcon className="mx-auto mb-4 h-12 w-12 opacity-40" />
                <p className="font-medium">Select a table to view and edit data</p>
                <p className="mt-1 text-sm">
                  Browse rows, insert new records, and update or delete existing rows.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Right Sidebar Drawer for Create Table */}
<div
  className={`fixed inset-0 z-50 transition-all duration-300 ${
    isCreateTableOpen ? 'pointer-events-auto' : 'pointer-events-none'
  }`}
>
  {/* Backdrop */}
  <div
    className={`absolute inset-0 bg-black transition-opacity duration-300 ${
      isCreateTableOpen ? 'opacity-50' : 'opacity-0'
    }`}
    onClick={() => setIsCreateTableOpen(false)}
  />
  
  {/* Drawer */}
  <div
    className={`absolute right-0 top-0 h-full w-full sm:w-[600px] lg:w-[700px] bg-white dark:bg-gray-950 shadow-xl transition-transform duration-300 ease-in-out transform ${
      isCreateTableOpen ? 'translate-x-0' : 'translate-x-full'
    }`}
  >
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-4 sticky top-0 bg-white dark:bg-gray-950 z-10">
        <div>
          <h2 className="text-lg font-semibold">Create a new table</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Under schema "{schemaName}"</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCreateTableOpen(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6">
          {/* Table Name */}
          <div>
      <Label className="text-sm font-medium">Name</Label>
      <Input
        value={tableFormData.table_name}
        onChange={(e) => setTableFormData({...tableFormData, table_name: e.target.value})}
        placeholder="Enter table name"
        className="mt-1.5"
        disabled={isCreatingTable}
      />
    </div>

    {/* Description */}
    <div>
      <Label className="text-sm font-medium">Description</Label>
      <p className="text-xs text-muted-foreground mb-1.5">Optional</p>
      <Input
        value={tableFormData.description}
        onChange={(e) => setTableFormData({...tableFormData, description: e.target.value})}
        placeholder="Add a description for this table"
        disabled={isCreatingTable}
      />
    </div>

          {/* RLS Toggle */}
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Enable Row Level Security (RLS)</span>
                <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                  RECOMMENDED
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Restrict access to your table by enabling RLS and writing Postgres policies.
              </p>
            </div>
            <div className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors data-[state=checked]:bg-primary data-[state=unchecked]:bg-input">
              <input
                type="checkbox"
                className="peer absolute h-4 w-4 cursor-pointer opacity-0"
                checked={true}
                readOnly
              />
              <span className="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5" />
            </div>
          </div>

          {/* Policies Warning */}
          <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
            <div className="flex gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500 mt-0.5" />
              <div>
                <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">
                  Policies are required to query data
                </p>
                <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                  You need to create an access policy before you can query data from this table. 
                  Without a policy, querying this table will return an empty array of results. 
                  You can create policies after saving this table.
                </p>
                <Button variant="link" className="text-xs text-yellow-800 dark:text-yellow-200 h-auto p-0 mt-1">
                  Documentation
                  <ExternalLink className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </div>
          </div>

          {/* Enable Realtime */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium">Enable Realtime</span>
              <p className="text-xs text-muted-foreground">
                Broadcast changes on this table to authorized subscribers.
              </p>
            </div>
            <div className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors data-[state=checked]:bg-primary data-[state=unchecked]:bg-input">
              <input
                type="checkbox"
                className="peer absolute h-4 w-4 cursor-pointer opacity-0"
              />
              <span className="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5" />
            </div>
          </div>

          {/* Columns Section Header */}
          <div className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Columns className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-medium">Columns</h3>
              </div>
              <Button 
                size="sm" 
                onClick={addTableColumn} 
                variant="outline"
                type="button"
                className="gap-1"
              >
                <Plus className="h-3 w-3" />
                Add column
              </Button>
            </div>
            
            <div className="space-y-3">
              {tableFormData.columns.map((column, index) => (
                <div key={index} className="border rounded-lg overflow-hidden">
                  <div className="bg-muted/30 px-3 py-2 border-b flex items-center justify-between">
                    <span className="text-sm font-medium">Column {index + 1}</span>
                    {index > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeTableColumn(index)}
                        className="text-red-600 hover:text-red-700 h-6 px-2"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <div className="p-3 space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-1">
                        <Label className="text-xs text-muted-foreground">Name</Label>
                        <Input
                          value={column.column_name}
                          onChange={(e) => updateTableColumn(index, 'column_name', e.target.value)}
                          placeholder="column_name"
                          className="mt-1 h-8 text-sm"
                          disabled={isCreatingTable}
                        />
                      </div>
                      <div className="col-span-1">
                        <Label className="text-xs text-muted-foreground">Type</Label>
                        <Select 
                          value={column.data_type} 
                          onValueChange={(value) => updateTableColumn(index, 'data_type', value)}
                        >
                          <SelectTrigger className="mt-1 h-8 text-sm">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            {dataTypes.map(type => (
                              <SelectItem key={type} value={type}>{type}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-1">
                        <Label className="text-xs text-muted-foreground">Default Value</Label>
                        <Input
                          value={column.column_default}
                          onChange={(e) => updateTableColumn(index, 'column_default', e.target.value)}
                          placeholder="NULL"
                          className="mt-1 h-8 text-sm font-mono"
                          disabled={isCreatingTable}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!column.is_nullable}
                          onChange={(e) => updateTableColumn(index, 'is_nullable', !e.target.checked)}
                          className="h-3.5 w-3.5"
                        />
                        <span className="text-muted-foreground">Is not nullable</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={column.is_primary_key}
                          onChange={(e) => updateTableColumn(index, 'is_primary_key', e.target.checked)}
                          className="h-3.5 w-3.5"
                        />
                        <span className="text-muted-foreground">Primary Key</span>
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Foreign Keys Section (collapsible) */}
          <div className="border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Foreign keys</span>
              </div>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1">
                <Plus className="h-3 w-3" />
                Add foreign key relation
              </Button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Footer */}
      <div className="border-t p-4 flex gap-2 justify-end bg-white dark:bg-gray-950">
        <Button 
          variant="outline" 
          onClick={() => setIsCreateTableOpen(false)} 
          disabled={isCreatingTable}
        >
          Cancel
        </Button>
        <Button 
          onClick={handleCreateTable} 
          disabled={isCreatingTable || !tableFormData.table_name || !tableFormData.columns[0]?.column_name}
          className="gap-2"
        >
          {isCreatingTable ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save
            </>
          )}
        </Button>
      </div>
    </div>
  </div>
</div>

      {/* Table Details Dialog with Column CRUD */}
      <Dialog open={isTableDetailsOpen} onOpenChange={setIsTableDetailsOpen}>
        <DialogContent className="sm:max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TableIcon className="h-5 w-5" />
              Table: {selectedTable?.table_name}
            </DialogTitle>
            <DialogDescription>
              Column details and table information for {schemaName}.{selectedTable?.table_name}
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
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    Columns ({tableColumns.length})
                  </h3>
                  <Button size="sm" onClick={openAddColumnDialog} className="gap-1">
                    <Plus className="h-4 w-4" />
                    Add Column
                  </Button>
                </div>
                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full min-w-[800px]">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-3 font-medium">Column Name</th>
                        <th className="text-left p-3 font-medium">Data Type</th>
                        <th className="text-left p-3 font-medium">Nullable</th>
                        <th className="text-left p-3 font-medium">Primary Key</th>
                        <th className="text-left p-3 font-medium">Default Value</th>
                        <th className="text-left p-3 font-medium">Actions</th>
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
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => openEditColumnDialog(column)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => openDeleteColumnDialog(column)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
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

      {/* Add Column Dialog */}
      <Dialog open={isAddColumnOpen} onOpenChange={setIsAddColumnOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Column</DialogTitle>
            <DialogDescription>
              Add a new column to {selectedTable?.table_name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Column Name *</Label>
              <Input
                value={columnFormData.column_name}
                onChange={(e) => setColumnFormData({...columnFormData, column_name: e.target.value})}
                placeholder="Enter column name"
                disabled={isAddingColumn}
              />
            </div>
            
            <div>
              <Label>Data Type *</Label>
              <Select 
                value={columnFormData.data_type} 
                onValueChange={(value) => setColumnFormData({...columnFormData, data_type: value})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select data type" />
                </SelectTrigger>
                <SelectContent>
                  {dataTypes.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="is_nullable"
                checked={columnFormData.is_nullable}
                onChange={(e) => setColumnFormData({...columnFormData, is_nullable: e.target.checked})}
                className="h-4 w-4"
              />
              <Label htmlFor="is_nullable" className="text-sm font-normal">
                Allow NULL values
              </Label>
            </div>
            
            <div>
              <Label>Default Value (Optional)</Label>
              <Input
                value={columnFormData.column_default}
                onChange={(e) => setColumnFormData({...columnFormData, column_default: e.target.value})}
                placeholder="e.g., 0, 'default', CURRENT_TIMESTAMP"
                disabled={isAddingColumn}
              />
              <p className="text-xs text-muted-foreground mt-1">
                For strings use quotes: 'default value'
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddColumnOpen(false)} disabled={isAddingColumn}>
              Cancel
            </Button>
            <Button onClick={handleAddColumn} disabled={isAddingColumn}>
              {isAddingColumn ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Column'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Column Dialog */}
      <Dialog open={isEditColumnOpen} onOpenChange={setIsEditColumnOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Column</DialogTitle>
            <DialogDescription>
              Edit column properties for {selectedTable?.table_name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Column Name</Label>
              <Input
                value={columnFormData.column_name}
                onChange={(e) => setColumnFormData({...columnFormData, column_name: e.target.value})}
                placeholder="Enter column name"
                disabled={isUpdatingColumn}
              />
            </div>
            
            <div>
              <Label>Data Type</Label>
              <Select 
                value={columnFormData.data_type} 
                onValueChange={(value) => setColumnFormData({...columnFormData, data_type: value})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select data type" />
                </SelectTrigger>
                <SelectContent>
                  {dataTypes.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="edit_is_nullable"
                checked={columnFormData.is_nullable}
                onChange={(e) => setColumnFormData({...columnFormData, is_nullable: e.target.checked})}
                className="h-4 w-4"
              />
              <Label htmlFor="edit_is_nullable" className="text-sm font-normal">
                Allow NULL values
              </Label>
            </div>
            
            <div>
              <Label>Default Value (Optional)</Label>
              <Input
                value={columnFormData.column_default}
                onChange={(e) => setColumnFormData({...columnFormData, column_default: e.target.value})}
                placeholder="e.g., 0, 'default', CURRENT_TIMESTAMP"
                disabled={isUpdatingColumn}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Leave empty to remove default value. For strings use quotes: 'default value'
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditColumnOpen(false)} disabled={isUpdatingColumn}>
              Cancel
            </Button>
            <Button onClick={handleEditColumn} disabled={isUpdatingColumn}>
              {isUpdatingColumn ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Column'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Column Dialog */}
      <Dialog open={isDeleteColumnOpen} onOpenChange={setIsDeleteColumnOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Delete Column
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the column and all its data.
            </DialogDescription>
          </DialogHeader>
          
          {selectedColumn && (
            <div className="py-4">
              <p className="text-sm">
                Are you sure you want to delete column <span className="font-semibold">{selectedColumn.column_name}</span>?
              </p>
              {selectedColumn.is_primary_key && (
                <p className="text-sm text-red-600 mt-2">
                  Warning: This is a primary key column. Deleting it may affect table relationships.
                </p>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteColumnOpen(false)} disabled={isDeletingColumn}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteColumn} disabled={isDeletingColumn}>
              {isDeletingColumn ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Column'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Table Dialog */}
      <Dialog open={isDeleteTableOpen} onOpenChange={setIsDeleteTableOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Delete Table
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the table and all its data.
            </DialogDescription>
          </DialogHeader>
          
          {tableToDelete && (
            <div className="py-4">
              <p className="text-sm">
                Are you sure you want to delete table <span className="font-semibold">{tableToDelete.table_name}</span>?
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                This will delete all {tableToDelete.row_count.toLocaleString()} rows and related objects.
              </p>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteTableOpen(false)} disabled={isDeletingTable}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteTable} disabled={isDeletingTable}>
              {isDeletingTable ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Table'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}