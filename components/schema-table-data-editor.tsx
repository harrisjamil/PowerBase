"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  AlertCircle,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  buildCreateRowDraft,
  buildEditRowDraft,
  buildRowValues,
  formatCellValue,
  getPrimaryKeyValues,
  getRowSummary,
  isGeneratedColumn,
  type RowFieldDraft,
  type RowFieldMode,
  type TableColumnInfo,
  type TableRowData,
} from "@/lib/table-row-form"

type ColumnsResponse = {
  success: boolean
  columns?: TableColumnInfo[]
  error?: string
}

type RowMutationResponse = {
  success: boolean
  row?: TableRowData | null
  error?: string
}

type SchemaTableDataEditorProps = {
  schemaName: string
  tableName: string
  rowCount?: number
  tableSize?: string
  onRowCountChange?: (delta: number) => void
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function SchemaTableDataEditor({
  schemaName,
  tableName,
  rowCount,
  tableSize,
  onRowCountChange,
}: SchemaTableDataEditorProps) {
  const [columns, setColumns] = useState<TableColumnInfo[]>([])
  const [rows, setRows] = useState<TableRowData[]>([])
  const [filterValue, setFilterValue] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [isAddRowOpen, setIsAddRowOpen] = useState(false)
  const [isEditRowOpen, setIsEditRowOpen] = useState(false)
  const [isDeleteRowOpen, setIsDeleteRowOpen] = useState(false)
  const [isCreatingRow, setIsCreatingRow] = useState(false)
  const [isUpdatingRow, setIsUpdatingRow] = useState(false)
  const [isDeletingRow, setIsDeletingRow] = useState(false)

  const [createRowFormData, setCreateRowFormData] = useState<Record<string, RowFieldDraft>>({})
  const [editRowFormData, setEditRowFormData] = useState<Record<string, RowFieldDraft>>({})
  const [editingRow, setEditingRow] = useState<TableRowData | null>(null)
  const [rowToDelete, setRowToDelete] = useState<TableRowData | null>(null)

  const dataUrl = `/api/schemas/${encodeURIComponent(schemaName)}/tables/${encodeURIComponent(tableName)}/data`
  const columnsUrl = `/api/schemas/${encodeURIComponent(schemaName)}/tables/${encodeURIComponent(tableName)}/columns`

  const loadTable = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const columnsResponse = await fetch(columnsUrl, { cache: "no-store" })
      const columnsResult = (await columnsResponse.json()) as ColumnsResponse
      if (!columnsResponse.ok || !columnsResult.success) {
        throw new Error(columnsResult.error || "Failed to load columns")
      }

      const dataResponse = await fetch(dataUrl, { cache: "no-store" })
      const dataContentType = dataResponse.headers.get("content-type") || ""
      if (!dataContentType.includes("application/json")) {
        throw new Error("Table data endpoint returned an unexpected response")
      }

      const dataResult = (await dataResponse.json()) as unknown
      if (!dataResponse.ok) {
        const message =
          dataResult &&
          typeof dataResult === "object" &&
          "error" in dataResult &&
          typeof (dataResult as { error?: unknown }).error === "string"
            ? (dataResult as { error: string }).error
            : "Failed to load table data"
        throw new Error(message)
      }

      if (!Array.isArray(dataResult)) {
        throw new Error("Failed to load table data")
      }

      setColumns(columnsResult.columns ?? [])
      setRows(dataResult as TableRowData[])
    } catch (loadError) {
      setColumns([])
      setRows([])
      setError(getErrorMessage(loadError, "Failed to load table"))
    } finally {
      setLoading(false)
    }
  }, [columnsUrl, dataUrl])

  useEffect(() => {
    void loadTable()
  }, [loadTable])

  const filteredRows = useMemo(() => {
    const query = filterValue.trim().toLowerCase()
    if (!query) return rows

    return rows.filter((row) =>
      Object.values(row).some((value) =>
        formatCellValue(value).toLowerCase().includes(query)
      )
    )
  }, [filterValue, rows])

  const primaryKeyColumns = useMemo(
    () => columns.filter((column) => column.is_primary_key),
    [columns]
  )

  const editableColumns = useMemo(
    () => columns.filter((column) => !isGeneratedColumn(column)),
    [columns]
  )

  const canEditRows = primaryKeyColumns.length > 0 && editableColumns.length > 0

  const openCreateRowDialog = () => {
    if (editableColumns.length === 0) {
      toast.error("This table has no editable columns.")
      return
    }
    setCreateRowFormData(buildCreateRowDraft(columns))
    setIsAddRowOpen(true)
  }

  const openEditRowDialog = (row: TableRowData) => {
    if (!canEditRows) {
      toast.error("Editing rows requires a primary key.")
      return
    }
    setEditingRow(row)
    setEditRowFormData(buildEditRowDraft(columns, row))
    setIsEditRowOpen(true)
  }

  const openDeleteRowDialog = (row: TableRowData) => {
    if (!canEditRows) {
      toast.error("Deleting rows requires a primary key.")
      return
    }
    setRowToDelete(row)
    setIsDeleteRowOpen(true)
  }

  const handleCreateRow = async () => {
    setIsCreatingRow(true)
    try {
      const values = buildRowValues(columns, createRowFormData)
      const response = await fetch(dataUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      })
      const result = (await response.json()) as RowMutationResponse
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to add row")
      }

      toast.success("Row added successfully.")
      setIsAddRowOpen(false)
      setCreateRowFormData({})
      onRowCountChange?.(1)
      await loadTable()
    } catch (createError) {
      toast.error(getErrorMessage(createError, "Failed to add row"))
    } finally {
      setIsCreatingRow(false)
    }
  }

  const handleUpdateRow = async () => {
    if (!editingRow) return

    setIsUpdatingRow(true)
    try {
      const values = buildRowValues(columns, editRowFormData)
      const primaryKeys = getPrimaryKeyValues(columns, editingRow)
      const response = await fetch(dataUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryKeys, values }),
      })
      const result = (await response.json()) as RowMutationResponse
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to update row")
      }

      toast.success("Row updated successfully.")
      setIsEditRowOpen(false)
      setEditingRow(null)
      setEditRowFormData({})
      await loadTable()
    } catch (updateError) {
      toast.error(getErrorMessage(updateError, "Failed to update row"))
    } finally {
      setIsUpdatingRow(false)
    }
  }

  const handleDeleteRow = async () => {
    if (!rowToDelete) return

    setIsDeletingRow(true)
    try {
      const primaryKeys = getPrimaryKeyValues(columns, rowToDelete)
      const response = await fetch(dataUrl, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryKeys }),
      })
      const result = (await response.json()) as RowMutationResponse
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to delete row")
      }

      toast.success("Row deleted successfully.")
      setIsDeleteRowOpen(false)
      setRowToDelete(null)
      onRowCountChange?.(-1)
      await loadTable()
    } catch (deleteError) {
      toast.error(getErrorMessage(deleteError, "Failed to delete row"))
    } finally {
      setIsDeletingRow(false)
    }
  }

  const renderRowField = (
    column: TableColumnInfo,
    formData: Record<string, RowFieldDraft>,
    setFormData: React.Dispatch<React.SetStateAction<Record<string, RowFieldDraft>>>,
    allowDefaultMode: boolean
  ) => {
    const field = formData[column.column_name]
    if (!field) return null

    const modeOptions: Array<{ value: RowFieldMode; label: string }> = [
      { value: "value", label: "Value" },
    ]
    if (column.is_nullable === "YES") {
      modeOptions.push({ value: "null", label: "NULL" })
    }
    if (allowDefaultMode && column.column_default) {
      modeOptions.push({ value: "default", label: "Default" })
    }

    return (
      <div key={column.column_name} className="rounded-lg border p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Label className="text-sm font-medium">{column.column_name}</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              {column.data_type}
              {column.is_primary_key ? " • primary key" : ""}
            </p>
          </div>
          <Select
            value={field.mode}
            onValueChange={(value) => {
              const nextMode = value as RowFieldMode
              setFormData((current) => ({
                ...current,
                [column.column_name]: {
                  ...current[column.column_name],
                  mode: nextMode,
                },
              }))
            }}
          >
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {field.mode === "value" ? (
          <Input
            className="mt-3 font-mono"
            value={field.value}
            onChange={(event) =>
              setFormData((current) => ({
                ...current,
                [column.column_name]: {
                  ...current[column.column_name],
                  value: event.target.value,
                },
              }))
            }
            placeholder={
              column.data_type.toLowerCase().includes("json")
                ? '{"key":"value"}'
                : `Enter ${column.column_name}`
            }
          />
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            {field.mode === "null"
              ? "This field will be saved as NULL."
              : "This field will use the database default value."}
          </p>
        )}
      </div>
    )
  }

  return (
    <>
      <Card className="h-full">
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
          <div>
            <CardTitle>{tableName}</CardTitle>
            <CardDescription>
              {schemaName}.{tableName} • {columns.length} column
              {columns.length === 1 ? "" : "s"} • {filteredRows.length} visible row
              {filteredRows.length === 1 ? "" : "s"}
              {rowCount != null ? ` • ~${rowCount.toLocaleString()} total` : ""}
              {tableSize ? ` • ${tableSize}` : ""}
              {!canEditRows ? " • edit/delete requires a primary key" : ""}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="gap-1"
              onClick={openCreateRowDialog}
              disabled={editableColumns.length === 0 || loading}
            >
              <Plus className="h-4 w-4" />
              Insert row
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={() => void loadTable()}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filter rows by any cell value..."
              value={filterValue}
              onChange={(event) => setFilterValue(event.target.value)}
              className="pl-9"
            />
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading table data...
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 py-8 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          ) : columns.length === 0 ? (
            <p className="py-8 text-sm text-muted-foreground">No columns found for this table.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((column) => (
                      <TableHead key={column.column_name} className="whitespace-nowrap">
                        {column.column_name}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {column.data_type}
                        </span>
                      </TableHead>
                    ))}
                    <TableHead className="w-[80px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row, rowIndex) => (
                    <TableRow key={rowIndex}>
                      {columns.map((column) => {
                        const value = row[column.column_name]
                        const textValue = formatCellValue(value)
                        const isNull = value === null || value === undefined

                        return (
                          <TableCell key={column.column_name} className="font-mono text-sm">
                            {isNull ? (
                              <span className="text-muted-foreground">null</span>
                            ) : (
                              <span
                                className="block max-w-[240px] truncate"
                                title={textValue}
                              >
                                {textValue}
                              </span>
                            )}
                          </TableCell>
                        )
                      })}
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => openEditRowDialog(row)}
                              disabled={!canEditRows}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit row
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => openDeleteRowDialog(row)}
                              disabled={!canEditRows}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete row
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredRows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={Math.max(columns.length + 1, 1)}
                        className="py-8 text-center text-muted-foreground"
                      >
                        {rows.length === 0
                          ? "No rows in this table"
                          : "No rows match the current filter"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isAddRowOpen} onOpenChange={setIsAddRowOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Insert row</DialogTitle>
            <DialogDescription>
              Add a new row to {schemaName}.{tableName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {editableColumns.map((column) =>
              renderRowField(column, createRowFormData, setCreateRowFormData, true)
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddRowOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateRow} disabled={isCreatingRow}>
              {isCreatingRow ? "Saving..." : "Insert row"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditRowOpen} onOpenChange={setIsEditRowOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit row</DialogTitle>
            <DialogDescription>Update values for the selected row.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {editableColumns.map((column) =>
              renderRowField(column, editRowFormData, setEditRowFormData, false)
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditRowOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateRow} disabled={isUpdatingRow}>
              {isUpdatingRow ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteRowOpen} onOpenChange={setIsDeleteRowOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete row</DialogTitle>
            <DialogDescription>
              Permanently delete{" "}
              {rowToDelete ? getRowSummary(columns, rowToDelete) : "this row"}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteRowOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteRow}
              disabled={isDeletingRow}
            >
              {isDeletingRow ? "Deleting..." : "Delete row"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
