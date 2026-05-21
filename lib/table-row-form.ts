export type TableColumnInfo = {
  column_name: string
  data_type: string
  is_nullable: "YES" | "NO"
  column_default: string | null
  is_primary_key: boolean
  is_identity?: boolean
  is_generated?: boolean
}

export type TableRowData = Record<string, unknown>

export type RowFieldMode = "value" | "null" | "default"

export type RowFieldDraft = {
  mode: RowFieldMode
  value: string
}

export function formatCellValue(value: unknown) {
  if (value === null || value === undefined) {
    return "null"
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  return String(value)
}

export function isGeneratedColumn(column: TableColumnInfo) {
  return Boolean(column.is_identity || column.is_generated)
}

function parseRowInputValue(column: TableColumnInfo, rawValue: string) {
  const trimmed = rawValue.trim()
  const dataType = column.data_type.toLowerCase()
  const isTextLike = /(char|text)/.test(dataType)

  if (!isTextLike && trimmed === "") {
    throw new Error(`Enter a value for "${column.column_name}".`)
  }

  if (dataType.includes("json")) {
    try {
      return JSON.parse(rawValue)
    } catch {
      throw new Error(`"${column.column_name}" must contain valid JSON.`)
    }
  }

  if (dataType.includes("bool")) {
    if (["true", "t", "1", "yes"].includes(trimmed.toLowerCase())) {
      return true
    }
    if (["false", "f", "0", "no"].includes(trimmed.toLowerCase())) {
      return false
    }
    throw new Error(`"${column.column_name}" must be true or false.`)
  }

  if (/(smallint|integer|bigint|serial|bigserial)/.test(dataType)) {
    if (!/^-?\d+$/.test(trimmed)) {
      throw new Error(`"${column.column_name}" must be a whole number.`)
    }
    return Number(trimmed)
  }

  if (/(numeric|decimal|real|double precision)/.test(dataType)) {
    const parsed = Number(trimmed)
    if (Number.isNaN(parsed)) {
      throw new Error(`"${column.column_name}" must be a number.`)
    }
    return parsed
  }

  return rawValue
}

export function buildCreateRowDraft(columns: TableColumnInfo[]) {
  return columns
    .filter((column) => !isGeneratedColumn(column))
    .reduce<Record<string, RowFieldDraft>>((draft, column) => {
      let mode: RowFieldMode = "value"
      if (column.column_default) {
        mode = "default"
      } else if (column.is_nullable === "YES") {
        mode = "null"
      }

      draft[column.column_name] = { mode, value: "" }
      return draft
    }, {})
}

export function buildEditRowDraft(columns: TableColumnInfo[], row: TableRowData) {
  return columns
    .filter((column) => !isGeneratedColumn(column))
    .reduce<Record<string, RowFieldDraft>>((draft, column) => {
      const currentValue = row[column.column_name]
      draft[column.column_name] =
        currentValue === null || currentValue === undefined
          ? { mode: "null", value: "" }
          : { mode: "value", value: formatCellValue(currentValue) }
      return draft
    }, {})
}

export function buildRowValues(
  columns: TableColumnInfo[],
  formData: Record<string, RowFieldDraft>
) {
  return columns
    .filter((column) => !isGeneratedColumn(column))
    .reduce<Record<string, unknown>>((values, column) => {
      const field = formData[column.column_name]
      if (!field) return values

      if (field.mode === "default") return values

      if (field.mode === "null") {
        values[column.column_name] = null
        return values
      }

      values[column.column_name] = parseRowInputValue(column, field.value)
      return values
    }, {})
}

export function getPrimaryKeyValues(columns: TableColumnInfo[], row: TableRowData) {
  return columns
    .filter((column) => column.is_primary_key)
    .reduce<Record<string, unknown>>((primaryKeys, column) => {
      primaryKeys[column.column_name] = row[column.column_name]
      return primaryKeys
    }, {})
}

export function getRowSummary(columns: TableColumnInfo[], row: TableRowData) {
  const primaryColumns = columns.filter((column) => column.is_primary_key)
  if (primaryColumns.length === 0) return "this row"

  return primaryColumns
    .map((column) => `${column.column_name}=${formatCellValue(row[column.column_name])}`)
    .join(", ")
}
