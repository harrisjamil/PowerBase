/** Secure cookies in production; COOKIE_SECURE=0 is ignored in production. */
export function useSecureSessionCookies() {
  if (process.env.NODE_ENV === "production") {
    return true
  }

  const override = process.env.COOKIE_SECURE?.trim().toLowerCase()
  if (override === "0" || override === "false") {
    return false
  }
  if (override === "1" || override === "true") {
    return true
  }
  return false
}
