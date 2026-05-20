import { useEffect, useRef } from "react"

/**
 * Runs `callback` on an interval and when the tab regains focus.
 * Skips the first interval tick so the caller can run an initial load separately.
 */
export function usePeriodicCallback(
  callback: () => void | Promise<void>,
  intervalMs: number,
  enabled = true
) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    if (!enabled || intervalMs <= 0) {
      return
    }

    let cancelled = false

    const run = () => {
      if (!cancelled) {
        void callbackRef.current()
      }
    }

    const intervalId = window.setInterval(run, intervalMs)

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        run()
      }
    }

    window.addEventListener("focus", onVisible)
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      window.removeEventListener("focus", onVisible)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [enabled, intervalMs])
}
