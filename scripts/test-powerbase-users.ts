/**
 * Test PowerBase REST API (Supabase-style) against the `users` table.
 *
 * Setup:
 *   1. npm run dev  (PowerBase running, e.g. http://localhost:3000)
 *   2. Copy Project URL + anon key from Client → Project → Settings → API keys
 *   3. Assign your PG user to the project in PowerBase (project settings → roles)
 *   4. Set in .env.local:
 *        POWERBASE_REST_URL, POWERBASE_ANON_KEY
 *        POWERBASE_REST_PG_USER, POWERBASE_REST_PG_PASSWORD
 *   5. Run: npm run test:powerbase-users
 */

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createPowerBaseClient } from "../lib/powerbase-client"

type UserRow = {
  id: string
  full_name: string
  password: string
  created_at: string
  updated_at: string | null
}

function loadEnvFile(filename: string) {
  const path = resolve(process.cwd(), filename)
  if (!existsSync(path)) return

  const content = readFileSync(path, "utf8")
  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue

    const index = trimmed.indexOf("=")
    if (index === -1) continue

    const key = trimmed.slice(0, index).trim()
    let value = trimmed.slice(index + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`Missing ${name}.`)
    console.error("")
    console.error("Add to .env.local or run:")
    console.error(`  $env:${name}="..."   # PowerShell`)
    console.error(`  export ${name}=...  # bash`)
    process.exit(1)
  }
  return value
}

function logStep(title: string) {
  console.log(`\n--- ${title} ---`)
}

function readCliFlag(name: string) {
  const prefix = `--${name}=`
  const arg = process.argv.find((entry) => entry.startsWith(prefix))
  return arg ? arg.slice(prefix.length).trim() : undefined
}

async function main() {
  loadEnvFile(".env.local")
  loadEnvFile(".env")

  const url = readCliFlag("url") ?? requireEnv("POWERBASE_REST_URL")
  const apiKey = readCliFlag("key") ?? requireEnv("POWERBASE_ANON_KEY")
  const pgUser = readCliFlag("pg-user") ?? requireEnv("POWERBASE_REST_PG_USER")
  const pgPassword = readCliFlag("pg-password") ?? requireEnv("POWERBASE_REST_PG_PASSWORD")

  const testId = `test-${Date.now()}`
  const testUser = {
    id: testId,
    full_name: "PowerBase REST Test User",
    password: "$2a$12$test.hash.only.for.api.test",
    created_at: new Date().toISOString(),
    updated_at: null,
  }

  console.log("PowerBase users table REST test")
  console.log(`URL:     ${url}`)
  console.log(`PG user: ${pgUser}`)
  console.log(`Table:   users`)
  console.log(`Test id: ${testId}`)

  const db = createPowerBaseClient({ url, apiKey, pgUser, pgPassword })

  logStep("1) Insert row")
  const insertResult = await db.from<UserRow>("users").insert(testUser)

  if (insertResult.error) {
    console.error("INSERT failed:", insertResult.error.message)
    process.exit(1)
  }

  console.log("Inserted:", JSON.stringify(insertResult.data?.[0] ?? null, null, 2))

  logStep("2) Read back by id (verify insert)")
  const selectResult = await db.from<UserRow>("users").eq("id", testId).select()

  if (selectResult.error) {
    console.error("SELECT failed:", selectResult.error.message)
    process.exit(1)
  }

  const found = selectResult.data?.find((row) => row.id === testId)
  if (!found) {
    console.error("VERIFY failed: row not found after insert.")
    console.error("Rows returned:", selectResult.data?.length ?? 0)
    process.exit(1)
  }

  console.log("Found row:", JSON.stringify(found, null, 2))

  if (found.full_name !== testUser.full_name) {
    console.error("VERIFY failed: full_name mismatch.")
    process.exit(1)
  }

  logStep("3) List users (limit 5, newest first if id sorts)")
  const listResult = await db.from<UserRow>("users").limit(5).select()

  if (listResult.error) {
    console.error("LIST failed:", listResult.error.message)
    process.exit(1)
  }

  console.log(`Total rows in sample: ${listResult.data?.length ?? 0}`)
  for (const row of listResult.data ?? []) {
    console.log(`  - id=${row.id}  full_name=${row.full_name}`)
  }

  const includesTest = (listResult.data ?? []).some((row) => row.id === testId)
  if (!includesTest) {
    console.warn("Note: test row not in first 5 rows (may still exist in DB).")
  }

  logStep("Result")
  console.log("SUCCESS: insert + read verified for users table.")
  console.log(`Check in PowerBase Table Editor: users → id = ${testId}`)
}

main().catch((error) => {
  console.error("Unexpected error:", error)
  process.exit(1)
})
