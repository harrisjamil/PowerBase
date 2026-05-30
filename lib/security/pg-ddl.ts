const ALLOWED_DATA_TYPES = new Set([
  "smallint",
  "integer",
  "int",
  "int2",
  "int4",
  "int8",
  "bigint",
  "serial",
  "bigserial",
  "smallserial",
  "numeric",
  "decimal",
  "real",
  "float4",
  "double precision",
  "float8",
  "float",
  "money",
  "boolean",
  "bool",
  "text",
  "varchar",
  "character varying",
  "char",
  "character",
  "bpchar",
  "uuid",
  "json",
  "jsonb",
  "bytea",
  "date",
  "time",
  "time without time zone",
  "time with time zone",
  "timetz",
  "timestamp",
  "timestamp without time zone",
  "timestamp with time zone",
  "timestamptz",
  "interval",
  "inet",
  "cidr",
  "macaddr",
  "point",
  "line",
  "lseg",
  "box",
  "path",
  "polygon",
  "circle",
])

const ALLOWED_TYPE_MODIFIERS = /^(\(\s*\d+\s*(,\s*\d+\s*)?\))?$/

const ALLOWED_COLUMN_DEFAULT =
  /^('([^']|'')*'|-?\d+(\.\d+)?|(TRUE|FALSE|NULL)|now\(\)|CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME|gen_random_uuid\(\)|uuid_generate_v4\(\)|LOCALTIMESTAMP|LOCALTIME)$/i

const ALLOWED_COLUMN_CONSTRAINTS = /^(NOT NULL|NULL|UNIQUE|PRIMARY KEY)$/i

function normalizeDataType(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase()
}

function stripTypeModifiers(normalized: string): string {
  return normalized.replace(/\(\s*\d+\s*(,\s*\d+\s*)?\)/g, "").trim()
}

export function validatePgDataType(value: string): { ok: true; sqlType: string } | { ok: false; error: string } {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 128) {
    return { ok: false, error: "Invalid data type." }
  }

  if (/[;'"\\]/.test(trimmed)) {
    return { ok: false, error: "Data type contains invalid characters." }
  }

  const normalized = normalizeDataType(trimmed)
  const base = stripTypeModifiers(normalized)
  const modifierMatch = normalized.slice(base.length)

  if (!ALLOWED_DATA_TYPES.has(base)) {
    return { ok: false, error: `Data type "${base}" is not allowed.` }
  }

  if (modifierMatch && !ALLOWED_TYPE_MODIFIERS.test(modifierMatch)) {
    return { ok: false, error: "Invalid type modifier." }
  }

  return { ok: true, sqlType: trimmed.toUpperCase() }
}

export function validatePgColumnDefault(
  value: string | null | undefined
): { ok: true; sqlDefault: string | null } | { ok: false; error: string } {
  if (value === null || value === undefined || value === "") {
    return { ok: true, sqlDefault: null }
  }

  const trimmed = value.trim()
  if (trimmed.length > 256) {
    return { ok: false, error: "Default value is too long." }
  }

  if (/[;]|--|\/\*|\*\//.test(trimmed)) {
    return { ok: false, error: "Default value contains invalid characters." }
  }

  if (!ALLOWED_COLUMN_DEFAULT.test(trimmed)) {
    return {
      ok: false,
      error: "Default value must be a literal, NULL, or an allowed function (now(), gen_random_uuid(), etc.).",
    }
  }

  return { ok: true, sqlDefault: trimmed }
}

export function validatePgColumnConstraints(
  value: string | null | undefined
): { ok: true; sqlConstraints: string | null } | { ok: false; error: string } {
  if (value === null || value === undefined || value.trim() === "") {
    return { ok: true, sqlConstraints: null }
  }

  const trimmed = value.trim()
  if (!ALLOWED_COLUMN_CONSTRAINTS.test(trimmed)) {
    return { ok: false, error: "Only NOT NULL, NULL, UNIQUE, and PRIMARY KEY constraints are allowed." }
  }

  return { ok: true, sqlConstraints: trimmed.toUpperCase() }
}
