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
  AlertTriangle
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
        setTables(tablesData.tables)
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

  const handleViewTable = async (table: Table) => {
    setSelectedTable(table)
    await fetchTableColumns(table.table_name)
    setIsTableDetailsOpen(true)
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

  const resetColumnForm = () => {
    setColumnFormData({
      column_name: '',
      data_type: 'VARCHAR(255)',
      is_nullable: true,
      column_default: ''
    })
    setSelectedColumn(null)
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
        <Button onClick={refreshData} disabled={refreshing} variant="outline" className="gap-2">
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </Button>
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

      {/* Tables List */}
      <Card>
        <CardHeader>
          <CardTitle>Tables in {schemaName}</CardTitle>
          <CardDescription>
            Showing {filteredTables.length} of {tables.length} tables
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredTables.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <TableIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No tables found in this schema</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTables.map((table) => (
                <div
                  key={table.table_name}
                  className="flex items-center justify-between p-4 rounded-lg border hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => handleViewTable(table)}
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
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={(e) => copyTableName(table.table_name, e)}
                      title="Copy table name"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={(e) => generateSelectSQL(table.table_name, e)}
                      title="Generate SELECT SQL"
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={(e) => exportTableAsJSON(table.table_name, e)}
                      title="Export as JSON"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleViewTable(table)}>
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
    </div>
  )
}