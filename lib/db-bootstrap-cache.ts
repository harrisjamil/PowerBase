const DEFAULT_BOOTSTRAP_TTL_MS = 5 * 60 * 1000

type BootstrapState = {
  expiresAt: number
  promise: Promise<void> | null
}

const bootstrapState = new Map<string, BootstrapState>()

export async function ensureDbBootstrap(
  key: string,
  work: () => Promise<void>,
  ttlMs = DEFAULT_BOOTSTRAP_TTL_MS
) {
  const now = Date.now()
  const existing = bootstrapState.get(key)

  if (existing) {
    if (existing.promise) {
      await existing.promise
      return
    }
    if (existing.expiresAt > now) {
      return
    }
  }

  const promise = work()
  bootstrapState.set(key, {
    expiresAt: now + ttlMs,
    promise,
  })

  try {
    await promise
    bootstrapState.set(key, {
      expiresAt: Date.now() + ttlMs,
      promise: null,
    })
  } catch (error) {
    bootstrapState.delete(key)
    throw error
  }
}
