type Bucket = {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

const WINDOW_MS = 15 * 60 * 1000

type RateLimitOptions = {
  key: string
  maxAttempts: number
  windowMs?: number
}

export function checkRateLimit({
  key,
  maxAttempts,
  windowMs = WINDOW_MS,
}: RateLimitOptions): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true }
  }

  if (bucket.count >= maxAttempts) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    }
  }

  bucket.count += 1
  return { allowed: true }
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  if (forwarded) return forwarded
  const realIp = request.headers.get("x-real-ip")?.trim()
  if (realIp) return realIp
  return "unknown"
}

export function rateLimitResponse(retryAfterSeconds: number) {
  return new Response(
    JSON.stringify({
      error: "Too many attempts. Please try again later.",
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSeconds),
      },
    }
  )
}
