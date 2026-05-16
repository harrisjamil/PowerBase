/** Use COOKIE_SECURE=0 when serving production over plain HTTP (e.g. IP:3000). */
export function useSecureSessionCookies() {
  const override = process.env.COOKIE_SECURE?.trim().toLowerCase()
  if (override === "0" || override === "false") {
    return false
  }
  if (override === "1" || override === "true") {
    return true
  }
  return process.env.NODE_ENV === "production"
}
