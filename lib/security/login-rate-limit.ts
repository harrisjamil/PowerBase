import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/security/rate-limit"

export function enforceLoginRateLimit(
  request: Request,
  identifier: string
): Response | null {
  const ip = getClientIp(request)
  const normalizedId = identifier.trim().toLowerCase().slice(0, 128)

  const ipCheck = checkRateLimit({
    key: `login:ip:${ip}`,
    maxAttempts: 30,
  })
  if (!ipCheck.allowed) {
    return rateLimitResponse(ipCheck.retryAfterSeconds)
  }

  if (normalizedId) {
    const userCheck = checkRateLimit({
      key: `login:user:${normalizedId}`,
      maxAttempts: 10,
    })
    if (!userCheck.allowed) {
      return rateLimitResponse(userCheck.retryAfterSeconds)
    }
  }

  return null
}

export function enforceTotpRateLimit(
  request: Request,
  loginChallenge: string
): Response | null {
  const ip = getClientIp(request)
  const challengeKey = loginChallenge.slice(0, 64)

  const ipCheck = checkRateLimit({
    key: `totp:ip:${ip}`,
    maxAttempts: 20,
  })
  if (!ipCheck.allowed) {
    return rateLimitResponse(ipCheck.retryAfterSeconds)
  }

  const challengeCheck = checkRateLimit({
    key: `totp:challenge:${challengeKey}`,
    maxAttempts: 5,
    windowMs: 5 * 60 * 1000,
  })
  if (!challengeCheck.allowed) {
    return rateLimitResponse(challengeCheck.retryAfterSeconds)
  }

  return null
}
