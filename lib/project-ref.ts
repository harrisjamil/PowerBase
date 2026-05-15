import { randomBytes } from "node:crypto"
import type { PoolClient } from "pg"
import { getQuotedProjectsTableRef } from "@/lib/control-schema"

export const PROJECT_REF_LENGTH = 20
const PROJECT_REF_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"

export function generateProjectRef() {
  const bytes = randomBytes(PROJECT_REF_LENGTH)
  let result = ""

  for (let index = 0; index < PROJECT_REF_LENGTH; index += 1) {
    result += PROJECT_REF_ALPHABET[bytes[index] % PROJECT_REF_ALPHABET.length]
  }

  return result
}

export function isValidProjectRef(value: string) {
  return new RegExp(`^[a-z0-9]{${PROJECT_REF_LENGTH}}$`).test(value)
}

export function parseProjectLookup(
  value: string
): { type: "id"; id: number } | { type: "ref"; ref: string } | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  if (/^\d+$/.test(trimmed)) {
    const id = Number(trimmed)
    if (Number.isInteger(id) && id > 0) {
      return { type: "id", id }
    }
    return null
  }

  if (isValidProjectRef(trimmed)) {
    return { type: "ref", ref: trimmed }
  }

  return null
}

async function projectRefExists(client: PoolClient, projectRef: string) {
  const result = await client.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM ${getQuotedProjectsTableRef()}
        WHERE project_ref = $1
      ) AS exists
    `,
    [projectRef]
  )

  return Boolean(result.rows[0]?.exists)
}

export async function allocateUniqueProjectRef(client: PoolClient) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = generateProjectRef()
    if (!(await projectRefExists(client, candidate))) {
      return candidate
    }
  }

  throw new Error("Failed to allocate a unique project reference")
}
