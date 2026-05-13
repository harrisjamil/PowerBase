export type ParsedDbUrl = {
  user: string
  password: string
  host: string
  port: string
  database: string
}

/** Parse postgres / postgresql connection string (uses WHATWG URL). */
export function parsePostgresUrl(connectionString: string): ParsedDbUrl {
  if (!connectionString || typeof connectionString !== "string") {
    return {
      user: "unknown",
      password: "",
      host: "unknown",
      port: "5432",
      database: "postgres",
    }
  }
  try {
    const normalized = connectionString.replace(/^postgres:\/\//i, "postgresql://")
    const u = new URL(normalized)
    if (!/^postgresql:$/i.test(u.protocol)) {
      throw new Error("unsupported protocol")
    }
    const database =
      (u.pathname || "/postgres").replace(/^\//, "").split("?")[0] || "postgres"
    return {
      user: decodeURIComponent((u.username || "").replace(/\+/g, " ")),
      password: decodeURIComponent((u.password || "").replace(/\+/g, " ")),
      host: u.hostname || "localhost",
      port: u.port || "5432",
      database,
    }
  } catch {
    return {
      user: "unknown",
      password: "",
      host: "unknown",
      port: "5432",
      database: "postgres",
    }
  }
}

function formatHostForUrl(host: string): string {
  if (!host) return "127.0.0.1"
  if (host.includes(":") && !host.startsWith("[")) return `[${host}]`
  return host
}

export function buildPostgresUrl(p: ParsedDbUrl): string {
  const user = encodeURIComponent(p.user)
  const passPart =
    p.password !== "" ? `:${encodeURIComponent(p.password)}` : ""
  const auth = p.user !== "" ? `${user}${passPart}@` : ""
  const host = formatHostForUrl(p.host)
  const port = p.port || "5432"
  const db = (p.database || "postgres").replace(/^\//, "")
  return `postgresql://${auth}${host}:${port}/${db}`
}
