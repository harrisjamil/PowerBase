export type PowerBaseClientOptions = {
  /** REST base URL, e.g. https://host/api/projects/{project_ref}/rest/v1 */
  url: string
  /** anon or service_role JWT from project settings */
  apiKey: string
  /** PostgreSQL role assigned to this project (verified on every request) */
  pgUser: string
  /** Password for the PostgreSQL role */
  pgPassword: string
  fetch?: typeof fetch
}

export type PowerBaseError = {
  message: string
  status?: number
}

export type PowerBaseResult<T> = {
  data: T | null
  error: PowerBaseError | null
}

type QueryState = {
  filters: Array<{ column: string; value: string }>
  orderBy: { column: string; ascending: boolean } | null
  limitValue: number | null
  offsetValue: number | null
}

function normalizeBaseUrl(url: string) {
  return url.replace(/\/$/, "")
}

function readErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message
    if (typeof message === "string" && message.trim()) {
      return message
    }
  }
  return `Request failed with status ${status}`
}

export function createPowerBaseClient(options: PowerBaseClientOptions) {
  const baseUrl = normalizeBaseUrl(options.url)
  const apiKey = options.apiKey.trim()
  const pgUser = options.pgUser.trim()
  const pgPassword = options.pgPassword
  const fetchImpl = options.fetch ?? fetch

  function request(table: string, init: RequestInit = {}, queryString?: string) {
    const headers = new Headers(init.headers)
    headers.set("Authorization", `Bearer ${apiKey}`)
    headers.set("apikey", apiKey)
    headers.set("x-powerbase-pg-user", pgUser)
    headers.set("x-powerbase-pg-password", pgPassword)
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json")
    }

    const path = `${baseUrl}/${encodeURIComponent(table)}`
    const url = queryString ? `${path}?${queryString}` : path

    return fetchImpl(url, {
      ...init,
      headers,
    })
  }

  function buildSearchParams(state: QueryState) {
    const params = new URLSearchParams()
    for (const filter of state.filters) {
      params.set(filter.column, `eq.${filter.value}`)
    }
    if (state.orderBy) {
      params.set(
        "order",
        `${state.orderBy.column}.${state.orderBy.ascending ? "asc" : "desc"}`
      )
    }
    if (state.limitValue !== null) {
      params.set("limit", String(state.limitValue))
    }
    if (state.offsetValue !== null) {
      params.set("offset", String(state.offsetValue))
    }
    return params
  }

  function from<T extends Record<string, unknown> = Record<string, unknown>>(table: string) {
    const state: QueryState = {
      filters: [],
      orderBy: null,
      limitValue: null,
      offsetValue: null,
    }

    const query = {
      eq(column: keyof T & string, value: string | number | boolean) {
        state.filters.push({ column, value: String(value) })
        return query
      },
      order(column: keyof T & string, options?: { ascending?: boolean }) {
        state.orderBy = {
          column,
          ascending: options?.ascending !== false,
        }
        return query
      },
      limit(count: number) {
        state.limitValue = count
        return query
      },
      offset(count: number) {
        state.offsetValue = count
        return query
      },
      async select(): Promise<PowerBaseResult<T[]>> {
        const params = buildSearchParams(state)
        const queryString = params.toString()
        const response = await request(table, {}, queryString || undefined)
        const body = (await response.json().catch(() => null)) as unknown
        if (!response.ok) {
          return {
            data: null,
            error: { message: readErrorMessage(body, response.status), status: response.status },
          }
        }
        return { data: Array.isArray(body) ? (body as T[]) : [], error: null }
      },
      async insert(values: Partial<T> | Partial<T>[]): Promise<PowerBaseResult<T[]>> {
        const payload = Array.isArray(values) ? values[0] : values
        const response = await request(table, {
          method: "POST",
          body: JSON.stringify(payload),
        })
        const body = (await response.json().catch(() => null)) as unknown
        if (!response.ok) {
          return {
            data: null,
            error: { message: readErrorMessage(body, response.status), status: response.status },
          }
        }
        const rows = Array.isArray(body) ? (body as T[]) : body ? [body as T] : []
        return { data: rows, error: null }
      },
      async update(values: Partial<T>): Promise<PowerBaseResult<T[]>> {
        const params = buildSearchParams(state)
        const queryString = params.toString()
        if (!queryString) {
          return {
            data: null,
            error: { message: "Call .eq() before update to target specific rows." },
          }
        }
        const response = await request(table, {
          method: "PATCH",
          body: JSON.stringify(values),
        }, queryString)
        const body = (await response.json().catch(() => null)) as unknown
        if (!response.ok) {
          return {
            data: null,
            error: { message: readErrorMessage(body, response.status), status: response.status },
          }
        }
        return { data: Array.isArray(body) ? (body as T[]) : [], error: null }
      },
      async delete(): Promise<PowerBaseResult<T[]>> {
        const params = buildSearchParams(state)
        const queryString = params.toString()
        if (!queryString) {
          return {
            data: null,
            error: { message: "Call .eq() before delete to target specific rows." },
          }
        }
        const response = await request(table, {
          method: "DELETE",
        }, queryString)
        const body = (await response.json().catch(() => null)) as unknown
        if (!response.ok) {
          return {
            data: null,
            error: { message: readErrorMessage(body, response.status), status: response.status },
          }
        }
        return { data: Array.isArray(body) ? (body as T[]) : [], error: null }
      },
    }

    return query
  }

  return { from }
}
