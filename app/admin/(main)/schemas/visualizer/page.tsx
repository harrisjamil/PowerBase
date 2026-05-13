"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Circle,
  Database,
  ExternalLink,
  KeyRound,
  Link2,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Table as TableIcon,
  ZoomIn,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

type SchemaSummary = {
  schema_name: string
  owner: string
  table_count: number
  total_size: string
  description: string | null
}

type TableSummary = {
  schema_name: string
  table_name: string
  table_type: string
  description: string | null
}

type Relationship = {
  constraint_name: string
  from_schema: string
  from_table: string
  from_column: string
  to_schema: string
  to_table: string
  to_column: string
}

type ColumnSummary = {
  schema_name: string
  table_name: string
  column_name: string
  data_type: string
  is_nullable: string
  is_primary_key: boolean
  is_foreign_key: boolean
  ordinal_position: number
}

type HierarchyResponse = {
  success: boolean
  schemas: SchemaSummary[]
  tables: TableSummary[]
  relationships: Relationship[]
  columns: ColumnSummary[]
  counts: {
    schemas: number
    tables: number
    relationships: number
    columns: number
  }
  error?: string
}

type TableNode = TableSummary & {
  key: string
  columns: ColumnSummary[]
  outgoing: Relationship[]
  incoming: Relationship[]
}

type PositionedNode = TableNode & {
  x: number
  y: number
  width: number
  height: number
  isFocused: boolean
}

type Edge = {
  key: string
  fromKey: string
  toKey: string
  crossSchema: boolean
}

const CARD_WIDTH = 290
const MIN_ZOOM = 0.7
const MAX_ZOOM = 1.5
const DEFAULT_ZOOM = 1

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Failed to load schema hierarchy"
}

function formatTableType(tableType: string) {
  return tableType === "BASE TABLE" ? "Table" : tableType
}

function getTableKey(schemaName: string, tableName: string) {
  return `${schemaName}.${tableName}`
}

function getVisibleColumnCount(columns: ColumnSummary[]) {
  return Math.min(columns.length, 7)
}

function getNodeHeight(columns: ColumnSummary[]) {
  const visibleCount = getVisibleColumnCount(columns)
  const hiddenCount = Math.max(columns.length - visibleCount, 0)
  return 74 + visibleCount * 28 + (hiddenCount > 0 ? 28 : 0) + 34
}

function getAnchorPoint(source: PositionedNode, target: PositionedNode) {
  const sourceCenterX = source.x + source.width / 2
  const sourceCenterY = source.y + source.height / 2
  const targetCenterX = target.x + target.width / 2
  const targetCenterY = target.y + target.height / 2
  const deltaX = targetCenterX - sourceCenterX
  const deltaY = targetCenterY - sourceCenterY

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return {
      x: deltaX >= 0 ? source.x + source.width : source.x,
      y: sourceCenterY,
    }
  }

  return {
    x: sourceCenterX,
    y: deltaY >= 0 ? source.y + source.height : source.y,
  }
}

function getEdgePath(source: PositionedNode, target: PositionedNode) {
  const start = getAnchorPoint(source, target)
  const end = getAnchorPoint(target, source)
  const controlOffset = Math.max(Math.abs(end.x - start.x) * 0.35, 60)

  return `M ${start.x} ${start.y} C ${start.x + controlOffset} ${start.y}, ${
    end.x - controlOffset
  } ${end.y}, ${end.x} ${end.y}`
}

export default function SchemaVisualizerPage() {
  const [data, setData] = useState<HierarchyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedSchemaName, setSelectedSchemaName] = useState("")
  const [tableSearch, setTableSearch] = useState("")
  const [selectedTableKey, setSelectedTableKey] = useState<string | null>(null)
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)

  const applyHierarchyData = useCallback((json: HierarchyResponse) => {
    setData(json)
    setError(null)
    setSelectedSchemaName((current) => {
      if (current && json.schemas.some((schema) => schema.schema_name === current)) {
        return current
      }

      return json.schemas[0]?.schema_name ?? ""
    })
  }, [])

  const fetchHierarchy = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true)
    }

    try {
      const response = await fetch("/api/schemas/hierarchy")
      const json = (await response.json()) as HierarchyResponse

      if (!response.ok || !json.success) {
        throw new Error(json.error || "Failed to load schema hierarchy")
      }

      applyHierarchyData(json)
    } catch (fetchError: unknown) {
      setError(getErrorMessage(fetchError))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [applyHierarchyData])

  useEffect(() => {
    let cancelled = false

    const loadInitialHierarchy = async () => {
      try {
        const response = await fetch("/api/schemas/hierarchy")
        const json = (await response.json()) as HierarchyResponse

        if (cancelled) {
          return
        }

        if (!response.ok || !json.success) {
          throw new Error(json.error || "Failed to load schema hierarchy")
        }

        applyHierarchyData(json)
      } catch (fetchError: unknown) {
        if (!cancelled) {
          setError(getErrorMessage(fetchError))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadInitialHierarchy()

    return () => {
      cancelled = true
    }
  }, [applyHierarchyData])

  const processed = useMemo(() => {
    if (!data) {
      return {
        schemas: [] as SchemaSummary[],
        tableMap: new Map<string, TableNode>(),
        tablesBySchema: new Map<string, TableNode[]>(),
      }
    }

    const tableMap = new Map<string, TableNode>()
    const tablesBySchema = new Map<string, TableNode[]>()
    const columnsByTable = new Map<string, ColumnSummary[]>()

    for (const column of data.columns) {
      const key = getTableKey(column.schema_name, column.table_name)
      const current = columnsByTable.get(key)
      if (current) {
        current.push(column)
      } else {
        columnsByTable.set(key, [column])
      }
    }

    for (const table of data.tables) {
      const key = getTableKey(table.schema_name, table.table_name)
      const node: TableNode = {
        ...table,
        key,
        columns: [...(columnsByTable.get(key) || [])].sort(
          (left, right) => left.ordinal_position - right.ordinal_position
        ),
        outgoing: [],
        incoming: [],
      }

      tableMap.set(key, node)

      const schemaTables = tablesBySchema.get(table.schema_name)
      if (schemaTables) {
        schemaTables.push(node)
      } else {
        tablesBySchema.set(table.schema_name, [node])
      }
    }

    for (const relationship of data.relationships) {
      tableMap
        .get(getTableKey(relationship.from_schema, relationship.from_table))
        ?.outgoing.push(relationship)
      tableMap
        .get(getTableKey(relationship.to_schema, relationship.to_table))
        ?.incoming.push(relationship)
    }

    for (const tables of tablesBySchema.values()) {
      tables.sort((left, right) => left.table_name.localeCompare(right.table_name))
    }

    return {
      schemas: [...data.schemas].sort((left, right) =>
        left.schema_name.localeCompare(right.schema_name)
      ),
      tableMap,
      tablesBySchema,
    }
  }, [data])

  const selectedSchema = processed.schemas.find(
    (schema) => schema.schema_name === selectedSchemaName
  )

  const schemaTables = useMemo(() => {
    return processed.tablesBySchema.get(selectedSchemaName) || []
  }, [processed.tablesBySchema, selectedSchemaName])

  const filteredSchemaTables = useMemo(() => {
    const query = tableSearch.trim().toLowerCase()

    if (!query) {
      return schemaTables
    }

    return schemaTables.filter((table) => {
      const searchableText = [
        table.table_name,
        table.description ?? "",
        table.table_type,
        ...table.columns.map((column) =>
          [column.column_name, column.data_type].join(" ")
        ),
      ]
        .join(" ")
        .toLowerCase()

      return searchableText.includes(query)
    })
  }, [schemaTables, tableSearch])

  const activeSelectedTableKey = useMemo(() => {
    if (!selectedTableKey) {
      return null
    }

    return schemaTables.some((table) => table.key === selectedTableKey)
      ? selectedTableKey
      : null
  }, [schemaTables, selectedTableKey])

  const canvasData = useMemo(() => {
    if (!selectedSchemaName) {
      return {
        nodes: [] as PositionedNode[],
        edges: [] as Edge[],
        width: 1400,
        height: 840,
        visibleTableCount: 0,
        visibleRelationshipCount: 0,
      }
    }

    const activeTable =
      activeSelectedTableKey && processed.tableMap.get(activeSelectedTableKey)
        ? processed.tableMap.get(activeSelectedTableKey) || null
        : null

    const visibleKeys = new Set<string>()

    if (activeTable) {
      visibleKeys.add(activeTable.key)

      for (const relation of activeTable.outgoing) {
        visibleKeys.add(getTableKey(relation.to_schema, relation.to_table))
      }

      for (const relation of activeTable.incoming) {
        visibleKeys.add(getTableKey(relation.from_schema, relation.from_table))
      }
    } else {
      for (const table of filteredSchemaTables) {
        visibleKeys.add(table.key)
      }
    }

    const baseNodes = Array.from(visibleKeys)
      .map((key) => processed.tableMap.get(key))
      .filter((node): node is TableNode => Boolean(node))
      .sort((left, right) => {
        if (activeTable?.key === left.key) return -1
        if (activeTable?.key === right.key) return 1
        if (left.schema_name !== right.schema_name) {
          return left.schema_name.localeCompare(right.schema_name)
        }
        return left.table_name.localeCompare(right.table_name)
      })

    const positionedNodes: PositionedNode[] = []

    if (activeTable && baseNodes.length > 0) {
      const focusNode = baseNodes[0]
      const focusHeight = getNodeHeight(focusNode.columns)
      positionedNodes.push({
        ...focusNode,
        x: 600,
        y: 260,
        width: CARD_WIDTH,
        height: focusHeight,
        isFocused: true,
      })

      const neighbors = baseNodes.slice(1)
      const radiusX = neighbors.length <= 2 ? 360 : 430
      const radiusY = neighbors.length <= 2 ? 180 : 260

      neighbors.forEach((node, index) => {
        const angle = (-Math.PI / 2) + (2 * Math.PI * index) / Math.max(neighbors.length, 1)
        positionedNodes.push({
          ...node,
          x: 600 + Math.cos(angle) * radiusX,
          y: 260 + Math.sin(angle) * radiusY,
          width: CARD_WIDTH,
          height: getNodeHeight(node.columns),
          isFocused: false,
        })
      })
    } else {
      const columnCount = Math.max(1, Math.min(3, Math.ceil(Math.sqrt(baseNodes.length || 1))))

      baseNodes.forEach((node, index) => {
        const columnIndex = index % columnCount
        const rowIndex = Math.floor(index / columnCount)

        positionedNodes.push({
          ...node,
          x: 80 + columnIndex * 360,
          y: 80 + rowIndex * 250,
          width: CARD_WIDTH,
          height: getNodeHeight(node.columns),
          isFocused: false,
        })
      })
    }

    const nodeMap = new Map(positionedNodes.map((node) => [node.key, node]))
    const edges = data?.relationships
      .filter((relationship) => {
        const fromKey = getTableKey(relationship.from_schema, relationship.from_table)
        const toKey = getTableKey(relationship.to_schema, relationship.to_table)

        if (!nodeMap.has(fromKey) || !nodeMap.has(toKey)) {
          return false
        }

        if (!activeTable) {
          return (
            relationship.from_schema === selectedSchemaName &&
            relationship.to_schema === selectedSchemaName
          )
        }

        return true
      })
      .map((relationship) => ({
        key: [
          relationship.constraint_name,
          relationship.from_schema,
          relationship.from_table,
          relationship.from_column,
          relationship.to_schema,
          relationship.to_table,
          relationship.to_column,
        ].join(":"),
        fromKey: getTableKey(relationship.from_schema, relationship.from_table),
        toKey: getTableKey(relationship.to_schema, relationship.to_table),
        crossSchema: relationship.from_schema !== relationship.to_schema,
      })) || []

    const width = Math.max(
      1400,
      ...positionedNodes.map((node) => node.x + node.width + 180)
    )
    const height = Math.max(
      840,
      ...positionedNodes.map((node) => node.y + node.height + 180)
    )

    return {
      nodes: positionedNodes,
      edges,
      width,
      height,
      visibleTableCount: positionedNodes.length,
      visibleRelationshipCount: edges.length,
    }
  }, [
    activeSelectedTableKey,
    data?.relationships,
    filteredSchemaTables,
    processed.tableMap,
    selectedSchemaName,
  ])

  const crossSchemaLinks = useMemo(() => {
    if (!data) {
      return 0
    }

    return data.relationships.filter(
      (relationship) => relationship.from_schema !== relationship.to_schema
    ).length
  }, [data])

  const zoomIn = () => {
    setZoom((current) => Math.min(MAX_ZOOM, Number((current + 0.1).toFixed(2))))
  }

  const zoomOut = () => {
    setZoom((current) => Math.max(MIN_ZOOM, Number((current - 0.1).toFixed(2))))
  }

  if (loading && !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Schema Visualizer</h1>
          <p className="text-sm text-muted-foreground">
            Canvas-style schema view with tables, columns, and foreign-key connections.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{data?.counts.schemas ?? 0} schemas</Badge>
          <Badge variant="outline">{data?.counts.tables ?? 0} tables</Badge>
          <Badge variant="outline">{crossSchemaLinks} cross-schema links</Badge>
          <Button
            onClick={() => void fetchHierarchy(true)}
            disabled={refreshing}
            variant="outline"
            className="gap-2"
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <CardHeader className="gap-3 border-b pb-4">
            <div>
              <CardTitle className="text-base">Explorer</CardTitle>
              <p className="text-sm text-muted-foreground">
                Choose a schema and focus any table on the canvas.
              </p>
            </div>
            <Select
              value={selectedSchemaName}
              onValueChange={(value) => {
                setSelectedSchemaName(value)
                setSelectedTableKey(null)
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select schema" />
              </SelectTrigger>
              <SelectContent>
                {processed.schemas.map((schema) => (
                  <SelectItem key={schema.schema_name} value={schema.schema_name}>
                    {schema.schema_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={tableSearch}
                onChange={(event) => setTableSearch(event.target.value)}
                placeholder="Search tables or columns..."
                className="pl-9"
              />
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="max-h-[72vh] overflow-auto">
              <div className="border-b px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Tables
              </div>

              {filteredSchemaTables.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  No tables found for this schema.
                </div>
              ) : (
                <div className="p-2">
                  <button
                    type="button"
                    onClick={() => setSelectedTableKey(null)}
                    className={cn(
                      "mb-2 flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors",
                      activeSelectedTableKey === null
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    )}
                  >
                    <span>Show whole schema</span>
                    <Badge
                      variant={activeSelectedTableKey === null ? "secondary" : "outline"}
                      className="ml-2"
                    >
                      {filteredSchemaTables.length}
                    </Badge>
                  </button>

                  <div className="space-y-1">
                    {filteredSchemaTables.map((table) => (
                      <button
                        key={table.key}
                        type="button"
                        onClick={() => setSelectedTableKey(table.key)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition-colors",
                          activeSelectedTableKey === table.key
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                        )}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {table.table_name}
                          </div>
                          <div
                            className={cn(
                              "text-xs",
                              activeSelectedTableKey === table.key
                                ? "text-primary-foreground/80"
                                : "text-muted-foreground"
                            )}
                          >
                            {table.columns.length} columns
                          </div>
                        </div>
                        <Badge
                          variant={activeSelectedTableKey === table.key ? "secondary" : "outline"}
                        >
                          {table.outgoing.length + table.incoming.length}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t px-4 py-4 text-sm">
                <div className="font-medium">{selectedSchema?.schema_name || "No schema"}</div>
                <div className="mt-1 text-muted-foreground">
                  {selectedSchema?.table_count ?? 0} tables | {selectedSchema?.total_size ?? "0 bytes"}
                </div>
                {selectedSchema?.description ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {selectedSchema.description}
                  </p>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <KeyRound className="h-3 w-3 text-amber-500" />
                Primary Key
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Circle className="h-3 w-3 text-sky-500" />
                Nullable
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Link2 className="h-3 w-3 text-violet-500" />
                Foreign Key
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{canvasData.visibleTableCount} visible tables</span>
              <span>{canvasData.visibleRelationshipCount} visible links</span>
              {activeSelectedTableKey ? (
                <Badge variant="secondary">
                  Focus: {activeSelectedTableKey.split(".").slice(-1)[0]}
                </Badge>
              ) : null}
            </div>
          </div>

          <CardContent className="p-0">
            <div className="relative h-[72vh] min-h-[620px] overflow-auto bg-[radial-gradient(circle_at_1px_1px,rgba(148,163,184,0.35)_1px,transparent_0)] [background-size:18px_18px]">
              {canvasData.nodes.length === 0 ? (
                <div className="flex h-full items-center justify-center px-6 text-center">
                  <div>
                    <Database className="mx-auto h-10 w-10 text-muted-foreground" />
                    <div className="mt-3 text-base font-medium">Nothing to draw yet</div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Pick a schema with tables, or clear the search to see the full
                      canvas.
                    </p>
                  </div>
                </div>
              ) : (
                <div
                  className="relative"
                  style={{
                    width: `${canvasData.width * zoom}px`,
                    height: `${canvasData.height * zoom}px`,
                  }}
                >
                  <div
                    className="absolute left-0 top-0 origin-top-left"
                    style={{
                      width: `${canvasData.width}px`,
                      height: `${canvasData.height}px`,
                      transform: `scale(${zoom})`,
                    }}
                  >
                    <svg
                      className="pointer-events-none absolute inset-0"
                      width={canvasData.width}
                      height={canvasData.height}
                      viewBox={`0 0 ${canvasData.width} ${canvasData.height}`}
                      fill="none"
                    >
                      {canvasData.edges.map((edge) => {
                        const source = canvasData.nodes.find((node) => node.key === edge.fromKey)
                        const target = canvasData.nodes.find((node) => node.key === edge.toKey)

                        if (!source || !target) {
                          return null
                        }

                        return (
                          <path
                            key={edge.key}
                            d={getEdgePath(source, target)}
                            stroke={edge.crossSchema ? "#8b5cf6" : "#94a3b8"}
                            strokeWidth={edge.crossSchema ? 2.25 : 1.75}
                            strokeDasharray={edge.crossSchema ? "8 8" : "0"}
                            opacity={0.9}
                          />
                        )
                      })}
                    </svg>

                    {canvasData.nodes.map((node) => {
                      const visibleColumns = node.columns.slice(0, getVisibleColumnCount(node.columns))
                      const hiddenCount = Math.max(node.columns.length - visibleColumns.length, 0)
                      const isCrossSchema = node.schema_name !== selectedSchemaName

                      return (
                        <button
                          key={node.key}
                          type="button"
                          onClick={() => {
                            if (node.schema_name === selectedSchemaName) {
                              setSelectedTableKey(node.key)
                            } else {
                              setSelectedSchemaName(node.schema_name)
                              setSelectedTableKey(node.key)
                            }
                          }}
                          className={cn(
                            "absolute overflow-hidden rounded-2xl border bg-background text-left shadow-sm transition-all hover:shadow-md",
                            node.isFocused
                              ? "border-primary ring-2 ring-primary/20"
                              : "border-border"
                          )}
                          style={{
                            left: `${node.x}px`,
                            top: `${node.y}px`,
                            width: `${node.width}px`,
                            height: `${node.height}px`,
                          }}
                        >
                          <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <TableIcon className="h-4 w-4 text-muted-foreground" />
                                <span className="truncate font-semibold">{node.table_name}</span>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <Badge variant="secondary">{formatTableType(node.table_type)}</Badge>
                                {isCrossSchema ? (
                                  <Badge variant="outline">{node.schema_name}</Badge>
                                ) : null}
                              </div>
                            </div>

                            <Button
                              asChild
                              size="icon-xs"
                              variant="ghost"
                              className="shrink-0"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <Link href={`/admin/schemas/${node.schema_name}`}>
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            </Button>
                          </div>

                          <div className="space-y-1 px-2 py-2">
                            {visibleColumns.map((column) => (
                              <div
                                key={`${node.key}.${column.column_name}`}
                                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-muted/60"
                              >
                                <div className="flex items-center gap-1">
                                  {column.is_primary_key ? (
                                    <KeyRound className="h-3.5 w-3.5 text-amber-500" />
                                  ) : column.is_foreign_key ? (
                                    <Link2 className="h-3.5 w-3.5 text-violet-500" />
                                  ) : column.is_nullable === "YES" ? (
                                    <Circle className="h-3.5 w-3.5 text-sky-500" />
                                  ) : (
                                    <div className="h-3.5 w-3.5 rounded-full bg-muted-foreground/30" />
                                  )}
                                </div>
                                <span className="truncate font-medium">{column.column_name}</span>
                                <span className="truncate text-[11px] text-muted-foreground">
                                  {column.data_type}
                                </span>
                              </div>
                            ))}

                            {hiddenCount > 0 ? (
                              <div className="px-2 py-1 text-xs text-muted-foreground">
                                +{hiddenCount} more columns
                              </div>
                            ) : null}
                          </div>

                          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between border-t bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                            <span>{node.columns.length} columns</span>
                            <span>
                              {node.outgoing.length} out | {node.incoming.length} in
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="absolute bottom-4 left-4 flex flex-col rounded-xl border bg-background/95 shadow-sm backdrop-blur">
                <Button variant="ghost" size="icon-sm" onClick={zoomIn}>
                  <Plus className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={zoomOut}>
                  <Minus className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => setZoom(DEFAULT_ZOOM)}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </div>

              <div className="absolute bottom-4 right-4 rounded-xl border bg-background/95 px-3 py-2 text-xs text-muted-foreground shadow-sm backdrop-blur">
                <div>Zoom: {Math.round(zoom * 100)}%</div>
                <div>
                  {canvasData.visibleTableCount} tables | {canvasData.visibleRelationshipCount} links
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
