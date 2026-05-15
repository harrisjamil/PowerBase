export function buildProjectSchemaName(name: string) {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")

  if (!normalized) {
    return ""
  }

  const safeName = /^\d/.test(normalized) ? `project_${normalized}` : normalized
  return safeName.slice(0, 63).replace(/_+$/g, "")
}
