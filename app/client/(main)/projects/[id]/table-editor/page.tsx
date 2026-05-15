"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertCircle,
  Layers3,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Rows3,
  Save,
  Search,
  Table as TableIcon,
  Trash2,
  ChevronDown,
} from "lucide-react";

type ProjectDetail = {
  id: number;
  name: string;
  schema_name: string;
  owner: string | null;
  table_count: number;
  total_size: string;
  description: string | null;
  creator_role_name: string | null;
  assigned_role_names: string[];
  assigned_role_count: number;
  status: string;
  created_at: string | null;
  updated_at: string | null;
};

type ProjectDetailResponse = {
  success: boolean;
  project?: ProjectDetail;
  error?: string;
};

type TableSummary = {
  table_name: string;
  table_type: string;
  row_count: number;
  table_size: string;
  description: string | null;
};

type TablesResponse = {
  success: boolean;
  tables?: TableSummary[];
  error?: string;
};

type ColumnInfo = {
  column_name: string;
  data_type: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
  is_primary_key: boolean;
  is_identity?: boolean;
  is_generated?: boolean;
  ordinal_position: number;
};

type ColumnsResponse = {
  success: boolean;
  columns?: ColumnInfo[];
  error?: string;
};

type TableRowData = Record<string, unknown>;

type RowMutationResponse = {
  success: boolean;
  row?: TableRowData | null;
  error?: string;
};

type TableColumnDraft = {
  column_name: string;
  data_type: string;
  is_nullable: boolean;
  column_default: string;
  is_primary_key: boolean;
};

type TableFormState = {
  table_name: string;
  description: string;
  columns: TableColumnDraft[];
};

type ColumnFormState = {
  column_name: string;
  data_type: string;
  is_nullable: boolean;
  column_default: string;
};

type RowFieldMode = "value" | "null" | "default";

type RowFieldDraft = {
  mode: RowFieldMode;
  value: string;
};

const DATA_TYPES = [
  "VARCHAR(255)",
  "VARCHAR(500)",
  "TEXT",
  "INTEGER",
  "BIGINT",
  "DECIMAL(10,2)",
  "BOOLEAN",
  "DATE",
  "TIMESTAMP",
  "JSON",
  "JSONB",
  "UUID",
  "SERIAL",
  "BIGSERIAL",
];

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatCellValue(value: unknown) {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

function getInitialTableForm(): TableFormState {
  return {
    table_name: "",
    description: "",
    columns: [
      {
        column_name: "",
        data_type: DATA_TYPES[0],
        is_nullable: true,
        column_default: "",
        is_primary_key: false,
      },
    ],
  };
}

function getInitialColumnForm(): ColumnFormState {
  return {
    column_name: "",
    data_type: DATA_TYPES[0],
    is_nullable: true,
    column_default: "",
  };
}

function isGeneratedColumn(column: ColumnInfo) {
  return Boolean(column.is_identity || column.is_generated);
}

function parseRowInputValue(column: ColumnInfo, rawValue: string) {
  const trimmed = rawValue.trim();
  const dataType = column.data_type.toLowerCase();
  const isTextLike = /(char|text)/.test(dataType);

  if (!isTextLike && trimmed === "") {
    throw new Error(`Enter a value for "${column.column_name}".`);
  }

  if (dataType.includes("json")) {
    try {
      return JSON.parse(rawValue);
    } catch {
      throw new Error(`"${column.column_name}" must contain valid JSON.`);
    }
  }

  if (dataType.includes("bool")) {
    if (["true", "t", "1", "yes"].includes(trimmed.toLowerCase())) {
      return true;
    }
    if (["false", "f", "0", "no"].includes(trimmed.toLowerCase())) {
      return false;
    }
    throw new Error(`"${column.column_name}" must be true or false.`);
  }

  if (/(smallint|integer|bigint|serial|bigserial)/.test(dataType)) {
    if (!/^-?\d+$/.test(trimmed)) {
      throw new Error(`"${column.column_name}" must be a whole number.`);
    }
    return Number(trimmed);
  }

  if (/(numeric|decimal|real|double precision)/.test(dataType)) {
    const parsed = Number(trimmed);
    if (Number.isNaN(parsed)) {
      throw new Error(`"${column.column_name}" must be a number.`);
    }
    return parsed;
  }

  return rawValue;
}

function buildCreateRowDraft(columns: ColumnInfo[]) {
  return columns
    .filter((column) => !isGeneratedColumn(column))
    .reduce<Record<string, RowFieldDraft>>((draft, column) => {
      let mode: RowFieldMode = "value";
      if (column.column_default) {
        mode = "default";
      } else if (column.is_nullable === "YES") {
        mode = "null";
      }

      draft[column.column_name] = {
        mode,
        value: "",
      };

      return draft;
    }, {});
}

function buildEditRowDraft(columns: ColumnInfo[], row: TableRowData) {
  return columns
    .filter((column) => !isGeneratedColumn(column))
    .reduce<Record<string, RowFieldDraft>>((draft, column) => {
      const currentValue = row[column.column_name];
      draft[column.column_name] =
        currentValue === null || currentValue === undefined
          ? { mode: "null", value: "" }
          : { mode: "value", value: formatCellValue(currentValue) };
      return draft;
    }, {});
}

function buildRowValues(columns: ColumnInfo[], formData: Record<string, RowFieldDraft>) {
  return columns
    .filter((column) => !isGeneratedColumn(column))
    .reduce<Record<string, unknown>>((values, column) => {
      const field = formData[column.column_name];
      if (!field) {
        return values;
      }

      if (field.mode === "default") {
        return values;
      }

      if (field.mode === "null") {
        values[column.column_name] = null;
        return values;
      }

      values[column.column_name] = parseRowInputValue(column, field.value);
      return values;
    }, {});
}

function getPrimaryKeyValues(columns: ColumnInfo[], row: TableRowData) {
  return columns
    .filter((column) => column.is_primary_key)
    .reduce<Record<string, unknown>>((primaryKeys, column) => {
      primaryKeys[column.column_name] = row[column.column_name];
      return primaryKeys;
    }, {});
}

function getRowSummary(columns: ColumnInfo[], row: TableRowData) {
  const primaryColumns = columns.filter((column) => column.is_primary_key);
  if (primaryColumns.length === 0) {
    return "this row";
  }

  return primaryColumns
    .map((column) => `${column.column_name}=${formatCellValue(row[column.column_name])}`)
    .join(", ");
}

export default function TableEditorPage() {
  const params = useParams();
  const projectId = params?.id as string;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [selectedTableName, setSelectedTableName] = useState<string | null>(null);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [rows, setRows] = useState<TableRowData[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [pageLoading, setPageLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [isCreateTableOpen, setIsCreateTableOpen] = useState(false);
  const [isManageColumnsOpen, setIsManageColumnsOpen] = useState(false);
  const [isAddColumnOpen, setIsAddColumnOpen] = useState(false);
  const [isEditColumnOpen, setIsEditColumnOpen] = useState(false);
  const [isDeleteColumnOpen, setIsDeleteColumnOpen] = useState(false);
  const [isDeleteTableOpen, setIsDeleteTableOpen] = useState(false);
  const [isAddRowOpen, setIsAddRowOpen] = useState(false);
  const [isEditRowOpen, setIsEditRowOpen] = useState(false);
  const [isDeleteRowOpen, setIsDeleteRowOpen] = useState(false);

  const [isCreatingTable, setIsCreatingTable] = useState(false);
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [isUpdatingColumn, setIsUpdatingColumn] = useState(false);
  const [isDeletingColumn, setIsDeletingColumn] = useState(false);
  const [isDeletingTable, setIsDeletingTable] = useState(false);
  const [isCreatingRow, setIsCreatingRow] = useState(false);
  const [isUpdatingRow, setIsUpdatingRow] = useState(false);
  const [isDeletingRow, setIsDeletingRow] = useState(false);

  const [tableFormData, setTableFormData] = useState<TableFormState>(getInitialTableForm);
  const [columnFormData, setColumnFormData] = useState<ColumnFormState>(getInitialColumnForm);
  const [createRowFormData, setCreateRowFormData] = useState<Record<string, RowFieldDraft>>({});
  const [editRowFormData, setEditRowFormData] = useState<Record<string, RowFieldDraft>>({});
  const [selectedColumn, setSelectedColumn] = useState<ColumnInfo | null>(null);
  const [editingRow, setEditingRow] = useState<TableRowData | null>(null);
  const [rowToDelete, setRowToDelete] = useState<TableRowData | null>(null);

  const loadProjectAndTables = useCallback(
    async (preferredTableName?: string | null) => {
      try {
        setPageLoading(true);
        setPageError(null);

        const projectResponse = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
        const projectContentType = projectResponse.headers.get("content-type") || "";
        if (!projectContentType.includes("application/json")) {
          throw new Error("Project details endpoint returned an unexpected response");
        }

        const projectResult = (await projectResponse.json()) as ProjectDetailResponse;
        if (!projectResponse.ok || !projectResult.success || !projectResult.project) {
          throw new Error(projectResult.error || "Project not found");
        }

        const schemaName = projectResult.project.schema_name;
        const tablesResponse = await fetch(
          `/api/schemas/${encodeURIComponent(schemaName)}/tables`,
          { cache: "no-store" }
        );
        const tablesContentType = tablesResponse.headers.get("content-type") || "";
        if (!tablesContentType.includes("application/json")) {
          throw new Error("Tables endpoint returned an unexpected response");
        }

        const tablesResult = (await tablesResponse.json()) as TablesResponse;
        if (!tablesResponse.ok || !tablesResult.success) {
          throw new Error(tablesResult.error || "Failed to load tables");
        }

        const nextTables = tablesResult.tables ?? [];
        setProject(projectResult.project);
        setTables(nextTables);
        setSelectedTableName((current) => {
          if (
            preferredTableName &&
            nextTables.some((table) => table.table_name === preferredTableName)
          ) {
            return preferredTableName;
          }

          if (current && nextTables.some((table) => table.table_name === current)) {
            return current;
          }

          return nextTables[0]?.table_name ?? null;
        });
      } catch (error) {
        setPageError(getErrorMessage(error, "Failed to load table editor"));
      } finally {
        setPageLoading(false);
      }
    },
    [projectId]
  );

  const loadSelectedTable = useCallback(async (schemaName: string, tableName: string) => {
    try {
      setDetailLoading(true);
      setDetailError(null);

      const [columnsResponse, dataResponse] = await Promise.all([
        fetch(
          `/api/schemas/${encodeURIComponent(schemaName)}/tables/${encodeURIComponent(
            tableName
          )}/columns`,
          { cache: "no-store" }
        ),
        fetch(
          `/api/schemas/${encodeURIComponent(schemaName)}/tables/${encodeURIComponent(
            tableName
          )}/data`,
          { cache: "no-store" }
        ),
      ]);

      const columnsContentType = columnsResponse.headers.get("content-type") || "";
      if (!columnsContentType.includes("application/json")) {
        throw new Error("Columns endpoint returned an unexpected response");
      }

      const columnsResult = (await columnsResponse.json()) as ColumnsResponse;
      if (!columnsResponse.ok || !columnsResult.success) {
        throw new Error(columnsResult.error || "Failed to load table columns");
      }

      const dataContentType = dataResponse.headers.get("content-type") || "";
      if (!dataContentType.includes("application/json")) {
        throw new Error("Table data endpoint returned an unexpected response");
      }

      const dataResult = (await dataResponse.json()) as unknown;
      if (!dataResponse.ok || !Array.isArray(dataResult)) {
        throw new Error("Failed to load table data");
      }

      setColumns(columnsResult.columns ?? []);
      setRows(dataResult as TableRowData[]);
    } catch (error) {
      setColumns([]);
      setRows([]);
      setDetailError(getErrorMessage(error, "Failed to load selected table"));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const refreshSelectedTable = useCallback(async () => {
    if (!project?.schema_name || !selectedTableName) {
      return;
    }

    await loadSelectedTable(project.schema_name, selectedTableName);
  }, [loadSelectedTable, project, selectedTableName]);

  useEffect(() => {
    if (!projectId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadProjectAndTables();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadProjectAndTables, projectId]);

  useEffect(() => {
    if (!project?.schema_name || !selectedTableName) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadSelectedTable(project.schema_name, selectedTableName);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadSelectedTable, project?.schema_name, selectedTableName]);

  const filteredTables = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return tables;
    }

    return tables.filter((table) => {
      return (
        table.table_name.toLowerCase().includes(query) ||
        table.table_type.toLowerCase().includes(query) ||
        (table.description ?? "").toLowerCase().includes(query)
      );
    });
  }, [searchQuery, tables]);

  const selectedTable = useMemo(() => {
    return tables.find((table) => table.table_name === selectedTableName) ?? null;
  }, [selectedTableName, tables]);

  const filteredRows = useMemo(() => {
    const query = filterValue.trim().toLowerCase();
    if (!query) {
      return rows;
    }

    return rows.filter((row) =>
      Object.values(row).some((value) => formatCellValue(value).toLowerCase().includes(query))
    );
  }, [filterValue, rows]);

  const primaryKeyColumns = useMemo(() => {
    return columns.filter((column) => column.is_primary_key);
  }, [columns]);

  const editableColumns = useMemo(() => {
    return columns.filter((column) => !isGeneratedColumn(column));
  }, [columns]);

  const canEditRows = primaryKeyColumns.length > 0 && editableColumns.length > 0;

  const resetTableForm = () => setTableFormData(getInitialTableForm());
  const resetColumnForm = () => setColumnFormData(getInitialColumnForm());

  const addTableColumn = () => {
    setTableFormData((current) => ({
      ...current,
      columns: [
        ...current.columns,
        {
          column_name: "",
          data_type: DATA_TYPES[0],
          is_nullable: true,
          column_default: "",
          is_primary_key: false,
        },
      ],
    }));
  };

  const removeTableColumn = (index: number) => {
    setTableFormData((current) => ({
      ...current,
      columns: current.columns.filter((_, columnIndex) => columnIndex !== index),
    }));
  };

  const updateTableColumn = <K extends keyof TableColumnDraft>(
    index: number,
    key: K,
    value: TableColumnDraft[K]
  ) => {
    setTableFormData((current) => ({
      ...current,
      columns: current.columns.map((column, columnIndex) =>
        columnIndex === index ? { ...column, [key]: value } : column
      ),
    }));
  };

  const handleCreateTable = async () => {
    if (!project?.schema_name) {
      return;
    }

    if (!tableFormData.table_name.trim()) {
      toast.error("Table name is required.");
      return;
    }

    if (!tableFormData.columns.some((column) => column.column_name.trim())) {
      toast.error("Add at least one column.");
      return;
    }

    setIsCreatingTable(true);

    try {
      const response = await fetch(
        `/api/schemas/${encodeURIComponent(project.schema_name)}/tables`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tableFormData),
        }
      );

      const result = (await response.json()) as {
        success: boolean;
        table_name?: string;
        error?: string;
      };

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to create table");
      }

      toast.success(`Table ${result.table_name || tableFormData.table_name} created successfully.`);
      setIsCreateTableOpen(false);
      resetTableForm();
      setPageLoading(true);
      await loadProjectAndTables(result.table_name || tableFormData.table_name);
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to create table"));
    } finally {
      setIsCreatingTable(false);
    }
  };

  const handleAddColumn = async () => {
    if (!project?.schema_name || !selectedTableName) {
      return;
    }

    if (!columnFormData.column_name.trim()) {
      toast.error("Column name is required.");
      return;
    }

    setIsAddingColumn(true);

    try {
      const response = await fetch(
        `/api/schemas/${encodeURIComponent(project.schema_name)}/tables/${encodeURIComponent(
          selectedTableName
        )}/columns`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(columnFormData),
        }
      );

      const result = (await response.json()) as { success: boolean; error?: string };
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to add column");
      }

      toast.success(`Column ${columnFormData.column_name} added successfully.`);
      setIsAddColumnOpen(false);
      resetColumnForm();
      await refreshSelectedTable();
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to add column"));
    } finally {
      setIsAddingColumn(false);
    }
  };

  const openEditColumnDialog = (column: ColumnInfo) => {
    setIsManageColumnsOpen(false);
    setSelectedColumn(column);
    setColumnFormData({
      column_name: column.column_name,
      data_type: column.data_type,
      is_nullable: column.is_nullable === "YES",
      column_default: column.column_default || "",
    });
    setIsEditColumnOpen(true);
  };

  const openDeleteColumnDialog = (column: ColumnInfo) => {
    setIsManageColumnsOpen(false);
    setSelectedColumn(column);
    setIsDeleteColumnOpen(true);
  };

  const handleEditColumn = async () => {
    if (!project?.schema_name || !selectedTableName || !selectedColumn) {
      return;
    }

    if (!columnFormData.column_name.trim()) {
      toast.error("Column name is required.");
      return;
    }

    setIsUpdatingColumn(true);

    try {
      const response = await fetch(
        `/api/schemas/${encodeURIComponent(project.schema_name)}/tables/${encodeURIComponent(
          selectedTableName
        )}/columns`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            old_name: selectedColumn.column_name,
            new_name: columnFormData.column_name,
            data_type: columnFormData.data_type,
            is_nullable: columnFormData.is_nullable,
            column_default: columnFormData.column_default,
          }),
        }
      );

      const result = (await response.json()) as { success: boolean; error?: string };
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to update column");
      }

      toast.success(`Column ${selectedColumn.column_name} updated successfully.`);
      setIsEditColumnOpen(false);
      setSelectedColumn(null);
      resetColumnForm();
      await refreshSelectedTable();
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to update column"));
    } finally {
      setIsUpdatingColumn(false);
    }
  };

  const handleDeleteColumn = async () => {
    if (!project?.schema_name || !selectedTableName || !selectedColumn) {
      return;
    }

    setIsDeletingColumn(true);

    try {
      const response = await fetch(
        `/api/schemas/${encodeURIComponent(project.schema_name)}/tables/${encodeURIComponent(
          selectedTableName
        )}/columns?column_name=${encodeURIComponent(selectedColumn.column_name)}`,
        {
          method: "DELETE",
        }
      );

      const result = (await response.json()) as { success: boolean; error?: string };
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to delete column");
      }

      toast.success(`Column ${selectedColumn.column_name} deleted successfully.`);
      setIsDeleteColumnOpen(false);
      setSelectedColumn(null);
      await refreshSelectedTable();
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to delete column"));
    } finally {
      setIsDeletingColumn(false);
    }
  };

  const handleDeleteTable = async () => {
    if (!project?.schema_name || !selectedTableName) {
      return;
    }

    setIsDeletingTable(true);

    try {
      const response = await fetch(
        `/api/schemas/${encodeURIComponent(project.schema_name)}/tables?table_name=${encodeURIComponent(
          selectedTableName
        )}&cascade=false`,
        {
          method: "DELETE",
        }
      );

      const result = (await response.json()) as { success: boolean; error?: string };
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to delete table");
      }

      toast.success(`Table ${selectedTableName} deleted successfully.`);
      setIsDeleteTableOpen(false);
      setIsManageColumnsOpen(false);
      setSelectedColumn(null);
      setEditingRow(null);
      setRowToDelete(null);
      await loadProjectAndTables();
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to delete table"));
    } finally {
      setIsDeletingTable(false);
    }
  };

  const openCreateRowDialog = () => {
    if (editableColumns.length === 0) {
      toast.error("This table has no editable columns.");
      return;
    }

    setCreateRowFormData(buildCreateRowDraft(columns));
    setIsAddRowOpen(true);
  };

  const openEditRowDialog = (row: TableRowData) => {
    if (!canEditRows) {
      toast.error("Editing rows requires a primary key.");
      return;
    }

    setEditingRow(row);
    setEditRowFormData(buildEditRowDraft(columns, row));
    setIsEditRowOpen(true);
  };

  const openDeleteRowDialog = (row: TableRowData) => {
    if (!canEditRows) {
      toast.error("Deleting rows requires a primary key.");
      return;
    }

    setRowToDelete(row);
    setIsDeleteRowOpen(true);
  };

  const handleCreateRow = async () => {
    if (!project?.schema_name || !selectedTableName) {
      return;
    }

    setIsCreatingRow(true);

    try {
      const values = buildRowValues(columns, createRowFormData);
      const response = await fetch(
        `/api/schemas/${encodeURIComponent(project.schema_name)}/tables/${encodeURIComponent(
          selectedTableName
        )}/data`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ values }),
        }
      );

      const result = (await response.json()) as RowMutationResponse;
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to add row");
      }

      toast.success("Row added successfully.");
      setIsAddRowOpen(false);
      setCreateRowFormData({});
      setTables((current) =>
        current.map((table) =>
          table.table_name === selectedTableName
            ? { ...table, row_count: table.row_count + 1 }
            : table
        )
      );
      await refreshSelectedTable();
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to add row"));
    } finally {
      setIsCreatingRow(false);
    }
  };

  const handleUpdateRow = async () => {
    if (!project?.schema_name || !selectedTableName || !editingRow) {
      return;
    }

    setIsUpdatingRow(true);

    try {
      const values = buildRowValues(columns, editRowFormData);
      const primaryKeys = getPrimaryKeyValues(columns, editingRow);
      const response = await fetch(
        `/api/schemas/${encodeURIComponent(project.schema_name)}/tables/${encodeURIComponent(
          selectedTableName
        )}/data`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ primaryKeys, values }),
        }
      );

      const result = (await response.json()) as RowMutationResponse;
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to update row");
      }

      toast.success("Row updated successfully.");
      setIsEditRowOpen(false);
      setEditingRow(null);
      setEditRowFormData({});
      await refreshSelectedTable();
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to update row"));
    } finally {
      setIsUpdatingRow(false);
    }
  };

  const handleDeleteRow = async () => {
    if (!project?.schema_name || !selectedTableName || !rowToDelete) {
      return;
    }

    setIsDeletingRow(true);

    try {
      const primaryKeys = getPrimaryKeyValues(columns, rowToDelete);
      const response = await fetch(
        `/api/schemas/${encodeURIComponent(project.schema_name)}/tables/${encodeURIComponent(
          selectedTableName
        )}/data`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ primaryKeys }),
        }
      );

      const result = (await response.json()) as RowMutationResponse;
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to delete row");
      }

      toast.success("Row deleted successfully.");
      setIsDeleteRowOpen(false);
      setRowToDelete(null);
      setTables((current) =>
        current.map((table) =>
          table.table_name === selectedTableName
            ? { ...table, row_count: Math.max(table.row_count - 1, 0) }
            : table
        )
      );
      await refreshSelectedTable();
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to delete row"));
    } finally {
      setIsDeletingRow(false);
    }
  };

  const renderRowField = (
    column: ColumnInfo,
    formData: Record<string, RowFieldDraft>,
    setFormData: React.Dispatch<React.SetStateAction<Record<string, RowFieldDraft>>>,
    allowDefaultMode: boolean
  ) => {
    const field = formData[column.column_name];
    if (!field) {
      return null;
    }

    const modeOptions: Array<{ value: RowFieldMode; label: string }> = [{ value: "value", label: "Value" }];
    if (column.is_nullable === "YES") {
      modeOptions.push({ value: "null", label: "NULL" });
    }
    if (allowDefaultMode && column.column_default) {
      modeOptions.push({ value: "default", label: "Default" });
    }

    return (
      <div key={column.column_name} className="rounded-lg border border-gray-200 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Label className="text-sm font-medium">{column.column_name}</Label>
            <p className="mt-1 text-xs text-gray-500">
              {column.data_type}
              {column.is_primary_key ? " • primary key" : ""}
            </p>
          </div>

          <Select
            value={field.mode}
            onValueChange={(value) => {
              const nextMode = value as RowFieldMode;
              setFormData((current) => ({
                ...current,
                [column.column_name]: {
                  ...current[column.column_name],
                  mode: nextMode,
                },
              }));
            }}
          >
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Choose mode" />
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
          <p className="mt-3 text-xs text-gray-500">
            {field.mode === "null"
              ? "This field will be saved as NULL."
              : "This field will use the database default value."}
          </p>
        )}
      </div>
    );
  };

  if (!projectId) {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="text-sm font-medium text-red-700">Invalid project ID</p>
        </div>
      </div>
    );
  }

  if (pageLoading) {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading tables...
        </div>
      </div>
    );
  }

  if (pageError || !project) {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="text-sm font-medium text-red-700">{pageError || "Project not found"}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full">
        <div className="flex w-80 flex-col border-r border-gray-200 bg-white">
          <div className="border-b border-gray-200 p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Tables</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {filteredTables.length} table{filteredTables.length === 1 ? "" : "s"}
                </p>
              </div>
              <Button size="sm" className="gap-1" onClick={() => setIsCreateTableOpen(true)}>
                <Plus className="h-4 w-4" />
                New Table
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search tables..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="space-y-2 p-2">
              {filteredTables.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-gray-500">
                  No tables found for this search.
                </div>
              ) : (
                filteredTables.map((table) => (
                  <button
                    key={table.table_name}
                    onClick={() => {
                      setSelectedTableName(table.table_name);
                      setDetailLoading(true);
                      setDetailError(null);
                    }}
                    className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                      selectedTableName === table.table_name
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-transparent text-gray-700 hover:border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <TableIcon className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{table.table_name}</p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <Badge variant="outline" className="text-[10px]">
                            {table.table_type}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {table.row_count} rows
                          </Badge>
                        </div>
                        {table.description ? (
                          <p className="mt-2 line-clamp-2 text-xs text-gray-500">{table.description}</p>
                        ) : null}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>

          <div className="border-t border-gray-200 p-4">
            <p className="mb-2 text-xs font-medium text-gray-500">Project summary</p>
            <div className="space-y-1">
              <div className="flex items-center gap-2 py-1 text-xs text-gray-600">
                <Layers3 className="h-3 w-3 text-sky-500" />
                <span>{project.table_count} total tables</span>
              </div>
              <div className="flex items-center gap-2 py-1 text-xs text-gray-600">
                <Rows3 className="h-3 w-3 text-emerald-500" />
                <span>{project.total_size} total size</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-gray-50">
          {selectedTable ? (
            <div className="p-6">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Table Editor</h1>
                  <p className="mt-1 text-sm text-gray-500">
                    schema {project.schema_name} / {selectedTable.table_name}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => void refreshSelectedTable()}
                  disabled={detailLoading}
                >
                  {detailLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Refresh
                </Button>
              </div>

              <div className="mb-6 flex gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Filter rows by any cell value"
                    value={filterValue}
                    onChange={(e) => setFilterValue(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
                  <div>
                    <CardTitle className="text-sm font-medium">{selectedTable.table_name}</CardTitle>
                    <CardDescription>
                      {columns.length} column{columns.length === 1 ? "" : "s"} and {filteredRows.length} visible
                      {" "}row{filteredRows.length === 1 ? "" : "s"}
                      {!canEditRows ? " • editing requires a primary key" : ""}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" className="gap-1">
                          <Plus className="h-4 w-4" />
                          Insert
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setIsAddColumnOpen(true)}
                          disabled={!selectedTableName}
                        >
                          Add Column
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={openCreateRowDialog}
                          disabled={editableColumns.length === 0}
                        >
                          Add Row
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" className="gap-1">
                          Actions
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setIsManageColumnsOpen(true)}>
                          Manage Columns
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setIsDeleteTableOpen(true)}
                        >
                          Delete Table
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent>
                  {detailLoading ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading table...
                    </div>
                  ) : detailError ? (
                    <div className="flex items-center gap-2 text-sm text-red-600">
                      <AlertCircle className="h-4 w-4" />
                      {detailError}
                    </div>
                  ) : columns.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      Select a table with visible columns to inspect its rows.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {columns.map((column) => (
                              <TableHead key={column.column_name} className="font-semibold">
                                {column.column_name}
                                <span className="ml-2 text-xs font-normal text-gray-500">
                                  {column.data_type}
                                </span>
                              </TableHead>
                            ))}
                            <TableHead className="w-[96px] text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredRows.map((row, rowIndex) => (
                            <TableRow key={rowIndex} className="hover:bg-gray-50">
                              {columns.map((column) => {
                                const value = row[column.column_name];
                                const textValue = formatCellValue(value);
                                const isNull = value === null || value === undefined;

                                return (
                                  <TableCell key={column.column_name} className="font-mono text-sm">
                                    {isNull ? (
                                      <span className="text-gray-400">null</span>
                                    ) : (
                                      <span className="block max-w-[280px] truncate" title={textValue}>
                                        {textValue}
                                      </span>
                                    )}
                                  </TableCell>
                                );
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
                                      <Pencil className="h-4 w-4" />
                                      Edit Row
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      variant="destructive"
                                      onClick={() => openDeleteRowDialog(row)}
                                      disabled={!canEditRows}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      Delete Row
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
                                className="py-8 text-center text-gray-500"
                              >
                                {rows.length === 0
                                  ? "No rows found in this table"
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

              <div className="mt-6 flex flex-wrap gap-3 text-xs text-gray-500">
                <span>Schema: {project.schema_name}</span>
                <span>•</span>
                <span>Table size: {selectedTable.table_size}</span>
                <span>•</span>
                <span>Estimated rows: {selectedTable.row_count}</span>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <TableIcon className="mx-auto mb-4 h-16 w-16 text-gray-300" />
                <p className="text-gray-500">No tables available for this project</p>
                <p className="text-sm text-gray-400">
                  Create a table to start exploring and editing data.
                </p>
                <Button className="mt-4 gap-1" onClick={() => setIsCreateTableOpen(true)}>
                  <Plus className="h-4 w-4" />
                  New Table
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={isCreateTableOpen}
        onOpenChange={(open) => {
          setIsCreateTableOpen(open);
          if (!open && !isCreatingTable) {
            resetTableForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create Table</DialogTitle>
            <DialogDescription>
              Add a new table under `{project.schema_name}` with one or more columns.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="table-name">Table name</Label>
              <Input
                id="table-name"
                value={tableFormData.table_name}
                onChange={(event) =>
                  setTableFormData((current) => ({
                    ...current,
                    table_name: event.target.value,
                  }))
                }
                placeholder="project_items"
                disabled={isCreatingTable}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="table-description">Description</Label>
              <Input
                id="table-description"
                value={tableFormData.description}
                onChange={(event) =>
                  setTableFormData((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Optional table description"
                disabled={isCreatingTable}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Columns</Label>
                <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addTableColumn}>
                  <Plus className="h-4 w-4" />
                  Add Column
                </Button>
              </div>

              {tableFormData.columns.map((column, index) => (
                <div key={index} className="rounded-lg border border-gray-200 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-medium">Column {index + 1}</p>
                    {tableFormData.columns.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeTableColumn(index)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="grid gap-2">
                      <Label>Name</Label>
                      <Input
                        value={column.column_name}
                        onChange={(event) =>
                          updateTableColumn(index, "column_name", event.target.value)
                        }
                        placeholder="column_name"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label>Type</Label>
                      <Select
                        value={column.data_type}
                        onValueChange={(value) => updateTableColumn(index, "data_type", value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          {DATA_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-2">
                      <Label>Default</Label>
                      <Input
                        value={column.column_default}
                        onChange={(event) =>
                          updateTableColumn(index, "column_default", event.target.value)
                        }
                        placeholder="Optional default"
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!column.is_nullable}
                        onChange={(event) =>
                          updateTableColumn(index, "is_nullable", !event.target.checked)
                        }
                      />
                      Not nullable
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={column.is_primary_key}
                        onChange={(event) =>
                          updateTableColumn(index, "is_primary_key", event.target.checked)
                        }
                      />
                      Primary key
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateTableOpen(false)} disabled={isCreatingTable}>
              Cancel
            </Button>
            <Button onClick={handleCreateTable} disabled={isCreatingTable} className="gap-1">
              {isCreatingTable ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Create Table
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isManageColumnsOpen}
        onOpenChange={(open) => {
          setIsManageColumnsOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Manage Columns</DialogTitle>
            <DialogDescription>
              Edit or delete columns in `{selectedTableName}`.
            </DialogDescription>
          </DialogHeader>

          {columns.length === 0 ? (
            <p className="text-sm text-gray-500">No columns available for this table.</p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Nullable</TableHead>
                    <TableHead>Default</TableHead>
                    <TableHead className="w-[160px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {columns.map((column) => (
                    <TableRow key={column.column_name}>
                      <TableCell className="font-mono text-sm">{column.column_name}</TableCell>
                      <TableCell className="font-mono text-xs text-gray-500">{column.data_type}</TableCell>
                      <TableCell>{column.is_nullable === "YES" ? "Yes" : "No"}</TableCell>
                      <TableCell className="font-mono text-xs text-gray-500">
                        {column.column_default || "None"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1"
                            onClick={() => openEditColumnDialog(column)}
                          >
                            <Pencil className="h-4 w-4" />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-red-600 hover:text-red-700"
                            onClick={() => openDeleteColumnDialog(column)}
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsManageColumnsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isAddColumnOpen}
        onOpenChange={(open) => {
          setIsAddColumnOpen(open);
          if (!open && !isAddingColumn) {
            resetColumnForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Column</DialogTitle>
            <DialogDescription>
              Add a new column to `{selectedTableName}`.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="column-name">Column name</Label>
              <Input
                id="column-name"
                value={columnFormData.column_name}
                onChange={(event) =>
                  setColumnFormData((current) => ({
                    ...current,
                    column_name: event.target.value,
                  }))
                }
                placeholder="column_name"
                disabled={isAddingColumn}
              />
            </div>

            <div className="grid gap-2">
              <Label>Data type</Label>
              <Select
                value={columnFormData.data_type}
                onValueChange={(value) =>
                  setColumnFormData((current) => ({
                    ...current,
                    data_type: value,
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {DATA_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="column-default">Default value</Label>
              <Input
                id="column-default"
                value={columnFormData.column_default}
                onChange={(event) =>
                  setColumnFormData((current) => ({
                    ...current,
                    column_default: event.target.value,
                  }))
                }
                placeholder="Optional default"
                disabled={isAddingColumn}
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!columnFormData.is_nullable}
                onChange={(event) =>
                  setColumnFormData((current) => ({
                    ...current,
                    is_nullable: !event.target.checked,
                  }))
                }
              />
              Not nullable
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddColumnOpen(false)} disabled={isAddingColumn}>
              Cancel
            </Button>
            <Button onClick={handleAddColumn} disabled={isAddingColumn} className="gap-1">
              {isAddingColumn ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Add Column
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isEditColumnOpen}
        onOpenChange={(open) => {
          setIsEditColumnOpen(open);
          if (!open && !isUpdatingColumn) {
            setSelectedColumn(null);
            resetColumnForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Column</DialogTitle>
            <DialogDescription>
              Update the selected column in `{selectedTableName}`.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-column-name">Column name</Label>
              <Input
                id="edit-column-name"
                value={columnFormData.column_name}
                onChange={(event) =>
                  setColumnFormData((current) => ({
                    ...current,
                    column_name: event.target.value,
                  }))
                }
                placeholder="column_name"
                disabled={isUpdatingColumn}
              />
            </div>

            <div className="grid gap-2">
              <Label>Data type</Label>
              <Select
                value={columnFormData.data_type}
                onValueChange={(value) =>
                  setColumnFormData((current) => ({
                    ...current,
                    data_type: value,
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {DATA_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-column-default">Default value</Label>
              <Input
                id="edit-column-default"
                value={columnFormData.column_default}
                onChange={(event) =>
                  setColumnFormData((current) => ({
                    ...current,
                    column_default: event.target.value,
                  }))
                }
                placeholder="Optional default"
                disabled={isUpdatingColumn}
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!columnFormData.is_nullable}
                onChange={(event) =>
                  setColumnFormData((current) => ({
                    ...current,
                    is_nullable: !event.target.checked,
                  }))
                }
              />
              Not nullable
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditColumnOpen(false)} disabled={isUpdatingColumn}>
              Cancel
            </Button>
            <Button onClick={handleEditColumn} disabled={isUpdatingColumn} className="gap-1">
              {isUpdatingColumn ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Update Column
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isDeleteColumnOpen}
        onOpenChange={(open) => {
          setIsDeleteColumnOpen(open);
          if (!open && !isDeletingColumn) {
            setSelectedColumn(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Column</DialogTitle>
            <DialogDescription>
              Delete `{selectedColumn?.column_name}` from `{selectedTableName}`. This cannot be undone.
            </DialogDescription>
          </DialogHeader>

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
                "Delete Column"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isDeleteTableOpen}
        onOpenChange={(open) => {
          setIsDeleteTableOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Table</DialogTitle>
            <DialogDescription>
              Delete `{selectedTableName}` and all of its data. This cannot be undone.
            </DialogDescription>
          </DialogHeader>

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
                "Delete Table"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isAddRowOpen}
        onOpenChange={(open) => {
          setIsAddRowOpen(open);
          if (!open && !isCreatingRow) {
            setCreateRowFormData({});
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Row</DialogTitle>
            <DialogDescription>
              Insert a new row into `{selectedTableName}`.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {editableColumns.map((column) =>
              renderRowField(column, createRowFormData, setCreateRowFormData, true)
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddRowOpen(false)} disabled={isCreatingRow}>
              Cancel
            </Button>
            <Button onClick={handleCreateRow} disabled={isCreatingRow} className="gap-1">
              {isCreatingRow ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Add Row
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isDeleteRowOpen}
        onOpenChange={(open) => {
          setIsDeleteRowOpen(open);
          if (!open && !isDeletingRow) {
            setRowToDelete(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Row</DialogTitle>
            <DialogDescription>
              Delete the row identified by {rowToDelete ? `\`${getRowSummary(columns, rowToDelete)}\`` : "the selected primary key"}.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteRowOpen(false)} disabled={isDeletingRow}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteRow} disabled={isDeletingRow}>
              {isDeletingRow ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Row"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isEditRowOpen}
        onOpenChange={(open) => {
          setIsEditRowOpen(open);
          if (!open && !isUpdatingRow) {
            setEditingRow(null);
            setEditRowFormData({});
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Row</DialogTitle>
            <DialogDescription>
              Update values for the selected row in `{selectedTableName}`.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {editableColumns.map((column) =>
              renderRowField(column, editRowFormData, setEditRowFormData, false)
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditRowOpen(false)} disabled={isUpdatingRow}>
              Cancel
            </Button>
            <Button onClick={handleUpdateRow} disabled={isUpdatingRow} className="gap-1">
              {isUpdatingRow ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Update Row
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}