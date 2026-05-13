import { Pool } from "pg"
import { getEffectiveDatabaseUrl } from "@/lib/effective-database-url"

let pool: Pool | null = null
let lastConnectionString: string | null = null

export function getPool(): Pool {
  const conn = getEffectiveDatabaseUrl()
  if (!conn) {
    throw new Error("DATABASE_URL not set")
  }
  if (pool && lastConnectionString === conn) {
    return pool
  }
  if (pool) {
    void pool.end()
    pool = null
    lastConnectionString = null
  }
  lastConnectionString = conn
  pool = new Pool({
    connectionString: conn,
    connectionTimeoutMillis: 5000,
    max: 10,
  })
  return pool
}

/** Call after changing host/port overrides so the next getPool() uses the new connection string. */
export function resetPool() {
  if (pool) {
    void pool.end()
    pool = null
    lastConnectionString = null
  }
}
