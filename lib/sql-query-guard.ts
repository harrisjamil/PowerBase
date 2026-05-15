import { getControlSchema } from "@/lib/control-schema"

const BLOCKED_STATEMENT_PATTERNS: RegExp[] = [
  /\bSET\s+(?:LOCAL\s+)?(?:search_path|role|session\s+authorization)\b/i,
  /\bRESET\s+(?:search_path|role)\b/i,
  /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:SCHEMA|DATABASE|ROLE|USER)\b/i,
  /\bDROP\s+(?:SCHEMA|DATABASE|ROLE|USER)\b/i,
  /\bALTER\s+(?:SCHEMA|DATABASE|ROLE|USER)\b/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i,
  /\bCOPY\s+.*\bPROGRAM\b/i,
  /\bdblink\b/i,
  /\bpg_read_file\b/i,
  /\bpg_write_file\b/i,
  /\blo_import\b/i,
  /\blo_export\b/i,
]

const SCHEMA_QUALIFIER_PATTERN =
  /"([^"]+)"\s*\.|([a-zA-Z_][a-zA-Z0-9_$]*)\s*\./g

const SYSTEM_SCHEMAS = new Set([
  "information_schema",
  "pg_catalog",
  "pg_toast",
  "pg_temp_1",
  "pg_toast_temp_1",
  "public",
])

function stripSqlComments(sql: string): string {
  let result = ""
  let index = 0
  let inSingleQuote = false
  let inDoubleQuote = false
  let inLineComment = false
  let inBlockComment = false

  while (index < sql.length) {
    const char = sql[index]
    const next = sql[index + 1]

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false
        result += char
      }
      index += 1
      continue
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false
        index += 2
        continue
      }
      index += 1
      continue
    }

    if (!inSingleQuote && !inDoubleQuote) {
      if (char === "-" && next === "-") {
        inLineComment = true
        index += 2
        continue
      }
      if (char === "/" && next === "*") {
        inBlockComment = true
        index += 2
        continue
      }
    }

    if (!inDoubleQuote && char === "'" && !inSingleQuote) {
      inSingleQuote = true
      result += " "
      index += 1
      continue
    }

    if (inSingleQuote) {
      if (char === "'" && next === "'") {
        index += 2
        continue
      }
      if (char === "'") {
        inSingleQuote = false
        result += " "
        index += 1
        continue
      }
      index += 1
      continue
    }

    if (!inSingleQuote && char === '"') {
      if (!inDoubleQuote) {
        inDoubleQuote = true
        result += char
        index += 1
        continue
      }
      inDoubleQuote = false
      result += char
      index += 1
      continue
    }

    result += char
    index += 1
  }

  return result
}

function normalizeSchemaName(value: string): string {
  return value.replace(/"/g, "").trim().toLowerCase()
}

export function extractSchemaQualifiers(sql: string): string[] {
  const sanitized = stripSqlComments(sql)
  const qualifiers: string[] = []
  let match: RegExpExecArray | null

  while ((match = SCHEMA_QUALIFIER_PATTERN.exec(sanitized)) !== null) {
    const qualifier = match[1] ?? match[2]
    if (qualifier) {
      qualifiers.push(normalizeSchemaName(qualifier))
    }
  }

  return qualifiers
}

export function validateProjectSqlQuery(
  sql: string,
  allowedSchema: string,
  knownSchemaNames: Iterable<string> = []
): { ok: true } | { ok: false; error: string } {
  const trimmed = sql.trim()
  if (!trimmed) {
    return { ok: false, error: "Enter a SQL query to run." }
  }

  if (trimmed.includes(";")) {
    const withoutTrailing = trimmed.replace(/;\s*$/, "")
    if (withoutTrailing.includes(";")) {
      return { ok: false, error: "Only one SQL statement can be executed at a time." }
    }
  }

  for (const pattern of BLOCKED_STATEMENT_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        ok: false,
        error: "This statement type is not allowed in the project SQL editor.",
      }
    }
  }

  const allowed = normalizeSchemaName(allowedSchema)
  const knownSchemas = new Set<string>([
    ...SYSTEM_SCHEMAS,
    normalizeSchemaName(getControlSchema()),
  ])

  for (const schemaName of knownSchemaNames) {
    knownSchemas.add(normalizeSchemaName(schemaName))
  }

  for (const qualifier of extractSchemaQualifiers(trimmed)) {
    if (qualifier === allowed) {
      continue
    }

    if (knownSchemas.has(qualifier) || qualifier.startsWith("pg_")) {
      return {
        ok: false,
        error: `Access to schema "${qualifier}" is not allowed. Queries must use schema "${allowedSchema}" only.`,
      }
    }
  }

  return { ok: true }
}
